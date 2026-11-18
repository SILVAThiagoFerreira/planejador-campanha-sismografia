/**
 * Modelo do WhatsApp salvo antes de uma mudança do padrão. Se o texto gravado for exatamente um dos modelos padrão
 * anteriores (config.report.supersededWhatsappTemplates), passa a valer o padrão atual; texto personalizado é mantido.
 * Sem a lista no config.json a função recusa, em vez de assumir uma lista vazia.
 */
export function withCurrentMessageTemplate(project, report) {
  if (!Array.isArray(report?.supersededWhatsappTemplates)) throw new Error('Configuração report.supersededWhatsappTemplates ausente em config.json.');
  if (report.supersededWhatsappTemplates.includes(project.messageTemplate)) return {...project, messageTemplate: report.whatsappTemplate};
  return project;
}
