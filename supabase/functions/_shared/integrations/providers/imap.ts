// Feblio · Prueba real de IMAP/SMTP con sockets TLS (Deno.connectTls / Deno.startTls).
// Solo se hace login y se cierra la sesión; no se leen mensajes. Si el runtime no
// permite sockets salientes, la prueba falla con un error explícito (nunca éxito falso).
import { b64encode } from '../crypto.ts'

export interface ImapCreds {
  username: string
  password: string
}

const TIMEOUT_MS = 10_000

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let t: number | undefined
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`Tiempo de espera agotado (${label})`)), TIMEOUT_MS)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(t)
  }
}

class LineReader {
  private buf = ''
  private dec = new TextDecoder()
  constructor(private conn: Deno.Conn) {}
  async line(): Promise<string> {
    while (!this.buf.includes('\n')) {
      const chunk = new Uint8Array(4096)
      const n = await this.conn.read(chunk)
      if (n === null) throw new Error('Conexión cerrada por el servidor')
      this.buf += this.dec.decode(chunk.subarray(0, n))
    }
    const i = this.buf.indexOf('\n')
    const l = this.buf.slice(0, i).replace(/\r$/, '')
    this.buf = this.buf.slice(i + 1)
    return l
  }
  async write(s: string) {
    await this.conn.write(new TextEncoder().encode(s + '\r\n'))
  }
}

function sanitizeHost(h: string): string {
  if (!/^[a-z0-9.-]{3,253}$/i.test(h)) throw new Error('Nombre de servidor no válido')
  return h
}

/** IMAP sobre TLS implícito (993): saludo + LOGIN + LOGOUT. */
export async function imapTest(host: string, port: number, creds: ImapCreds): Promise<Record<string, unknown>> {
  const conn = await withTimeout(Deno.connectTls({ hostname: sanitizeHost(host), port: port || 993 }), 'IMAP conectar')
  const r = new LineReader(conn)
  try {
    const greeting = await withTimeout(r.line(), 'IMAP saludo')
    if (!greeting.startsWith('* OK')) throw new Error(`Saludo IMAP inesperado: ${greeting.slice(0, 60)}`)
    const q = (s: string) => `"${s.replace(/(["\\])/g, '\\$1')}"`
    await r.write(`a1 LOGIN ${q(creds.username)} ${q(creds.password)}`)
    let line = ''
    do line = await withTimeout(r.line(), 'IMAP login')
    while (!/^a1 /.test(line))
    if (!/^a1 OK/i.test(line)) throw new Error('IMAP rechazó las credenciales')
    await r.write('a2 LOGOUT')
    return { imap: `${host}:${port || 993}`, login: 'ok' }
  } finally {
    try {
      conn.close()
    } catch {
      /* ya cerrada */
    }
  }
}

/** SMTP: 465 (TLS implícito) o 587 (STARTTLS) + AUTH PLAIN. No envía nada. */
export async function smtpTest(host: string, port: number, creds: ImapCreds): Promise<Record<string, unknown>> {
  const hostname = sanitizeHost(host)
  const p = port || 587
  let conn: Deno.Conn = p === 465 ? await withTimeout(Deno.connectTls({ hostname, port: p }), 'SMTP conectar') : await withTimeout(Deno.connect({ hostname, port: p }), 'SMTP conectar')
  let r = new LineReader(conn)
  const expect = async (code: string, label: string) => {
    let line = ''
    do line = await withTimeout(r.line(), label)
    while (/^\d{3}-/.test(line))
    if (!line.startsWith(code)) throw new Error(`${label}: ${line.slice(0, 80)}`)
    return line
  }
  try {
    await expect('220', 'SMTP saludo')
    await r.write('EHLO feblio.app')
    await expect('250', 'SMTP EHLO')
    if (p !== 465) {
      await r.write('STARTTLS')
      await expect('220', 'SMTP STARTTLS')
      conn = await withTimeout(Deno.startTls(conn as Deno.TcpConn, { hostname }), 'SMTP TLS')
      r = new LineReader(conn)
      await r.write('EHLO feblio.app')
      await expect('250', 'SMTP EHLO (TLS)')
    }
    await r.write(`AUTH PLAIN ${b64encode(`\u0000${creds.username}\u0000${creds.password}`)}`)
    await expect('235', 'SMTP autenticación')
    await r.write('QUIT')
    return { smtp: `${host}:${p}`, auth: 'ok' }
  } finally {
    try {
      conn.close()
    } catch {
      /* ya cerrada */
    }
  }
}

/** Envío real por SMTP (tras autenticar). Texto plano. */
export async function smtpSend(host: string, port: number, creds: ImapCreds, from: string, to: string, subject: string, text: string): Promise<void> {
  const hostname = sanitizeHost(host)
  const p = port || 587
  let conn: Deno.Conn = p === 465 ? await withTimeout(Deno.connectTls({ hostname, port: p }), 'SMTP conectar') : await withTimeout(Deno.connect({ hostname, port: p }), 'SMTP conectar')
  let r = new LineReader(conn)
  const expect = async (code: string, label: string) => {
    let line = ''
    do line = await withTimeout(r.line(), label)
    while (/^\d{3}-/.test(line))
    if (!line.startsWith(code)) throw new Error(`${label}: ${line.slice(0, 80)}`)
  }
  try {
    await expect('220', 'SMTP saludo')
    await r.write('EHLO feblio.app')
    await expect('250', 'SMTP EHLO')
    if (p !== 465) {
      await r.write('STARTTLS')
      await expect('220', 'SMTP STARTTLS')
      conn = await withTimeout(Deno.startTls(conn as Deno.TcpConn, { hostname }), 'SMTP TLS')
      r = new LineReader(conn)
      await r.write('EHLO feblio.app')
      await expect('250', 'SMTP EHLO (TLS)')
    }
    await r.write(`AUTH PLAIN ${b64encode(`\u0000${creds.username}\u0000${creds.password}`)}`)
    await expect('235', 'SMTP autenticación')
    await r.write(`MAIL FROM:<${from}>`)
    await expect('250', 'SMTP MAIL FROM')
    await r.write(`RCPT TO:<${to}>`)
    await expect('250', 'SMTP RCPT TO')
    await r.write('DATA')
    await expect('354', 'SMTP DATA')
    const body = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=UTF-8', '', text.replace(/^\./gm, '..'), '.'].join('\r\n')
    await r.write(body)
    await expect('250', 'SMTP envío')
    await r.write('QUIT')
  } finally {
    try {
      conn.close()
    } catch {
      /* ya cerrada */
    }
  }
}
