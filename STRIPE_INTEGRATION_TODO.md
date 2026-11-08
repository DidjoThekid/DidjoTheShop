# Intégration Stripe Checkout : étapes restantes

## Values to Replace
Aucun placeholder dans le code. `success_url` et `cancel_url` sont construits depuis l'adresse du site, et `line_items` vient de la commande (`price_data`, pas de Price IDs, car le catalogue est géré dans le panel admin).

Variables à ajouter dans Vercel (Settings > Environment Variables) :

| Variable | À mettre |
|----------|----------|
| STRIPE_SECRET_KEY | Clé secrète (sk_test_... pour tester, sk_live_... en réel) : https://dashboard.stripe.com/apikeys |
| STRIPE_WEBHOOK_SECRET | Secret du webhook (whsec_...), voir plus bas |

Tu peux supprimer les variables SUMUP_API_KEY et SUMUP_MERCHANT_CODE. Aucune clé publique n'est nécessaire (page hébergée par Stripe).

## Configured Parameters
Fichier : [api/index.js](api/index.js) (route `pay`)

| Parameter | Value |
|-----------|-------|
| ui_mode | hosted_page (stripe-node 21 ou plus) |
| billing_address_collection | required |
| phone_number_collection | enabled: false |
| automatic_tax | enabled: false |
| allow_promotion_codes | true |
| payment_method_collection | always (mode subscription uniquement) |
| submit_type | auto (mode payment uniquement) |
| name_collection | particulier et entreprise, facultatif |
| saved_payment_method_options | payment_method_save: enabled |
| integration_identifier | hosted_web_0001 |
| origin_context | web |

`mode` est `payment`, ou `subscription` si le panier contient un article « abonnement » (facturé chaque mois).

## Setup
1. Crée un compte Stripe et utilise d'abord le mode test.
2. Ajoute les variables ci-dessus dans Vercel, puis redéploie.
3. Dans Stripe > Developers > Webhooks, ajoute l'endpoint `https://didjotheshop-pearl.vercel.app/api/webhook` avec les événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`. Copie le « signing secret » dans STRIPE_WEBHOOK_SECRET.

## Structure
- `api/index.js` : routes `pay` (crée la session Checkout), `pay/confirm` (vérifie le paiement), `cards`
- `api/webhook.js` : marque la commande payée quand Stripe prévient le site

## Fonctionnement
Commande > `/api/pay` crée une session > redirection vers Stripe > retour sur `/#compte` > la commande passe « Payée » (vérification au retour et par webhook).

## Tests
En mode test, carte 4242 4242 4242 4242, date future, code à 3 chiffres au choix. Autres cartes de test : https://docs.stripe.com/testing

## Next steps
Passer en mode réel (clés sk_live_ et un nouveau webhook), rembourser depuis le dashboard Stripe, suivre les paiements dans Stripe > Payments.

Ressources : https://support.stripe.com et https://docs.stripe.com/mcp
