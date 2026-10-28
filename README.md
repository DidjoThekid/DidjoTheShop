# DidjoTheSHOP
Variables Vercel (Settings > Environment Variables) :
- BLOB_READ_WRITE_TOKEN : créé en connectant un Blob store au projet (Storage > Blob)
- DB_SECRET : longue chaîne aléatoire (dossier secret de la base)
- SESSION_SECRET : autre longue chaîne aléatoire
- ADMIN_EMAIL : l'email du compte administrateur (crée ce compte sur le site, il aura accès à /admin)
- RESEND_API_KEY, MAIL_FROM (ex: DidjoTheSHOP <commandes@teamdtk.fr>), MAIL_REPLY_TO (ton adresse Proton)
Déploiement : push sur GitHub, importe le dépôt dans Vercel.
