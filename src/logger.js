const events=[];
export function logEvent(type,message,details={}) {const event={timestamp:new Date().toISOString(),type,message,details};events.push(event);console[type==='error'?'error':'info']('[Campanha]',message,details);return event;}
export function exportLogs(){const url=URL.createObjectURL(new Blob([JSON.stringify(events,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`campanha-log-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
