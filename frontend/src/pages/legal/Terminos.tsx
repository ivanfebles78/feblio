import { LegalLayout, LegalSection } from './LegalLayout'
import { LEGAL_VERSIONS } from '../../lib/legal'

/**
 * Términos del servicio · BORRADOR ESTRUCTURADO.
 * Requiere revisión jurídica antes de considerarse definitivo (ver docs/onboarding.md).
 * Al modificar el texto, actualiza LEGAL_VERSIONS.terms en src/lib/legal.ts.
 */
export default function Terminos() {
  return (
    <LegalLayout title="Términos del servicio" version={LEGAL_VERSIONS.terms}>
      <LegalSection title="1. Objeto">
        <p>
          Feblio es un servicio en la nube que permite a empresas y profesionales gestionar solicitudes de clientes,
          presupuestos, provisiones de fondos, facturas, documentación y comunicaciones asociadas a sus proyectos.
          Estos términos regulan el acceso y uso del servicio por parte de la entidad que registra una cuenta de
          empresa (en adelante, «la Empresa») y de las personas que actúan en su nombre.
        </p>
      </LegalSection>
      <LegalSection title="2. Registro y cuenta">
        <p>
          Para usar Feblio es necesario registrar una cuenta indicando los datos de la persona responsable y los de la
          Empresa. La Empresa garantiza que la información facilitada es veraz y se compromete a mantenerla actualizada.
          Las credenciales de acceso son personales e intransferibles; la Empresa es responsable de su custodia y de
          las acciones realizadas desde su cuenta.
        </p>
      </LegalSection>
      <LegalSection title="3. Periodo de prueba y suscripción">
        <p>
          Tras verificar el correo electrónico, la Empresa dispone de un periodo de prueba gratuito de 14 días. Al
          finalizar, el uso continuado requiere una suscripción activa según las condiciones y precios vigentes que se
          comuniquen en el propio servicio.
        </p>
      </LegalSection>
      <LegalSection title="4. Integraciones con terceros">
        <p>
          Feblio puede conectarse, a petición de la Empresa, con servicios de terceros (repositorios documentales,
          correo, mensajería, telefonía o pasarelas de pago). La Empresa autoriza expresamente cada conexión, puede
          revocarla en cualquier momento desde Configuración y acepta las condiciones de uso propias de cada tercero.
          Feblio no almacena en el navegador las credenciales de estos servicios.
        </p>
      </LegalSection>
      <LegalSection title="5. Automatizaciones y supervisión humana">
        <p>
          Por defecto, Feblio solo prepara borradores (Nivel 1) y cualquier envío o acción hacia clientes u organismos
          requiere aprobación humana. La Empresa puede ampliar el nivel de automatización bajo su exclusiva
          responsabilidad y es responsable de revisar el contenido generado antes de su uso.
        </p>
      </LegalSection>
      <LegalSection title="6. Contenidos y datos de la Empresa">
        <p>
          La Empresa conserva la titularidad de los datos, documentos y contenidos que introduce en Feblio y concede a
          Feblio una licencia limitada para tratarlos con la única finalidad de prestar el servicio. La Empresa
          garantiza que dispone de base legal para tratar los datos de sus clientes finales.
        </p>
      </LegalSection>
      <LegalSection title="7. Usos prohibidos">
        <p>
          Queda prohibido utilizar Feblio para actividades ilícitas, para enviar comunicaciones no solicitadas sin
          consentimiento, para vulnerar derechos de terceros o para intentar acceder a datos de otras empresas usuarias.
        </p>
      </LegalSection>
      <LegalSection title="8. Disponibilidad y responsabilidad">
        <p>
          Feblio se presta «tal cual» con un esfuerzo razonable de disponibilidad. Salvo dolo o negligencia grave, la
          responsabilidad total de Feblio frente a la Empresa se limita a las cantidades abonadas durante los doce meses
          anteriores al hecho que origine la reclamación.
        </p>
      </LegalSection>
      <LegalSection title="9. Baja y cancelación">
        <p>
          La Empresa puede cancelar su cuenta en cualquier momento. Tras la cancelación, los datos se conservan durante
          el plazo necesario para cumplir obligaciones legales y después se eliminan o anonimizan.
        </p>
      </LegalSection>
      <LegalSection title="10. Modificaciones">
        <p>
          Feblio puede actualizar estos términos. Cada versión se identifica por su fecha; los cambios relevantes se
          comunicarán con antelación razonable y, cuando sea necesario, se solicitará una nueva aceptación.
        </p>
      </LegalSection>
      <LegalSection title="11. Legislación y jurisdicción">
        <p>
          Estos términos se rigen por la legislación española. Para cualquier controversia, las partes se someten a los
          juzgados y tribunales que correspondan conforme a la normativa aplicable.
        </p>
      </LegalSection>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Documento en revisión: este texto es un borrador estructurado pendiente de validación jurídica.
      </p>
    </LegalLayout>
  )
}
