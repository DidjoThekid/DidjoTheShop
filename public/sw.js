self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l){if(c.url.includes('/admin')&&'focus' in c){c.postMessage({box:1});return c.focus()}}
    return clients.openWindow('/admin#boite');
  }));
});