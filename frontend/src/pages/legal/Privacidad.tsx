import { LegalLayout, LegalSection } from './LegalLayout'
import { LEGAL_VERSIONS } from '../../lib/legal'

/**
 * Política de privacidad · BORRADOR ESTRUCTURADO.
 * Requiere revisión jurídica (RGPD / LOPDGDD) antes de considerarse definitiva.
 * Al modificar el texto, actualiza LEGAL_VERSIONS.privacy en src/lib/legal.ts.
 */
export default function Privacidad() {
  return (
    <LegalLayout title="Política de privacidad" version={LEGAL_VERSIONS.privacy}>
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          El responsable del tratamiento de los datos de las personas usuarias de Feblio es el titular de la
          plataforma. Los datos de contacto del responsable y, en su caso, del delegado de protección de datos se
          publicarán en esta página cuando el dominio definitivo esté operativo.
        </p>
      </LegalSection>
      <LegalSection title="2. Datos que tratamos">
        <p>
          Datos de registro (nombre y apellidos, correo electrónico, contraseña cifrada), datos de la empresa (razón
          social, identificación fiscal, dirección, contacto), datos de configuración de canales e integraciones (sin
          contraseñas ni tokens en texto claro), datos de uso y registros técnicos (dirección IP, navegador, fecha y
          hora), y los datos de clientes finales que la Empresa introduce en la plataforma.
        </p>
      </LegalSection>
      <LegalSection title="3. Finalidades y base jurídica">
        <ul className="list-disc space-y-1 pl-5">
          <li>Prestar el servicio contratado y gestionar la cuenta (ejecución del contrato).</li>
          <li>Verificar la identidad y el correo electrónico, y prevenir el fraude (interés legítimo y obligación legal).</li>
          <li>Registrar la aceptación de los textos legales y las preferencias de consentimiento (obligación legal).</li>
          <li>Enviar novedades y comunicaciones comerciales, solo si se ha dado consentimiento expreso y revocable.</li>
          <li>Conectar con servicios de terceros elegidos por la Empresa (consentimiento y ejecución del contrato).</li>
        </ul>
      </LegalSection>
      <LegalSection title="4. Feblio como encargado del tratamiento">
        <p>
          Respecto a los datos de los clientes finales que la Empresa introduce en Feblio, la Empresa es la responsable
          del tratamiento y Feblio actúa como encargado, tratando esos datos únicamente conforme a sus instrucciones y
          a las condiciones del contrato de encargo que forma parte de los Términos del servicio.
        </p>
      </LegalSection>
      <LegalSection title="5. Destinatarios y encargados">
        <p>
          Utilizamos proveedores de infraestructura y envío de correo ubicados en la Unión Europea o con garantías
          adecuadas. Las integraciones con terceros (Google, Microsoft, Meta, proveedores de SMS, telefonía o pagos)
          solo se activan a petición de la Empresa y se rigen además por las políticas de cada proveedor.
        </p>
      </LegalSection>
      <LegalSection title="6. Conservación">
        <p>
          Los datos se conservan mientras la cuenta esté activa y, después, durante los plazos exigidos por la
          normativa fiscal, mercantil y de protección de datos. Los registros de consentimiento y auditoría se
          conservan para acreditar el cumplimiento de obligaciones legales.
        </p>
      </LegalSection>
      <LegalSection title="7. Derechos">
        <p>
          Las personas interesadas pueden ejercer sus derechos de acceso, rectificación, supresión, oposición,
          limitación y portabilidad, así como retirar el consentimiento otorgado, escribiendo al contacto que se
          indique en esta página. También pueden presentar una reclamación ante la Agencia Española de Protección de
          Datos.
        </p>
      </LegalSection>
      <LegalSection title="8. Seguridad">
        <p>
          Aplicamos medidas técnicas y organizativas adecuadas: cifrado en tránsito y en reposo, aislamiento por
          empresa mediante políticas de seguridad a nivel de fila, cifrado de credenciales de integraciones, control de
          accesos y registro de auditoría.
        </p>
      </LegalSection>
      <LegalSection title="9. Cambios">
        <p>
          Esta política puede actualizarse. Cada versión se identifica por su fecha y los cambios relevantes se
          comunicarán a las personas usuarias.
        </p>
      </LegalSection>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Documento en revisión: este texto es un borrador estructurado pendiente de validación jurídica.
      </p>
    </LegalLayout>
  )
}
