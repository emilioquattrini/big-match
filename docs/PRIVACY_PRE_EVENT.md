# BIG MATCH — informativa per la pagina pre-evento

Preparata il 7 ottobre 2026 per la pubblicazione dell'anteprima. Titolare: **Chiara Zhu**, **chiara.czhu@gmail.com**. Versione: **`pre-event-2026-10-07-v1`**.

Il testo destinato al campo `privacy_notice` è in [privacy-pre-event.en.txt](privacy-pre-event.en.txt). È testo semplice in inglese, la lingua dell'app. Questa versione riguarda l'anteprima e va sostituita prima di aprire partecipazioni o richieste catalogo. La [bozza dell'informativa dell'evento](PRIVACY_NOTICE_DRAFT.md) resta separata, con le decisioni ancora da completare per quelle finalità.

## Comportamento della pagina

Un nuovo visitatore può scegliere tre carte, ottenere la composizione, scaricarla, condividerla e ritrovarla nello stesso browser. Con l'evento `draft`, la terza carta non crea una partecipazione nel backend e il form catalogo è nascosto. Non viene creato un nuovo account per questa composizione locale.

Il sito carica file statici e informazioni pubbliche dell'evento. Queste richieste producono dati tecnici presso i fornitori e attivano le protezioni applicative. Una sessione già presente nel browser può invece essere ripristinata, rinnovata o usata per leggere/cancellare dati precedenti; una richiesta pendente precedente può essere riconciliata con una lettura privata. La notice non promette assenza assoluta di Auth o di dati tecnici.

## Valutazione tecnica della finalità e delle misure

La base proposta per i dati tecnici dell'anteprima è l'art. 6(1)(f) GDPR. La motivazione riguarda disponibilità del servizio e protezione da richieste automatizzate; non viene estesa alla futura raccolta delle scelte o dei contatti. Il considerando 49 riconosce la sicurezza di reti e sistemi come interesse legittimo nei limiti di necessità e proporzionalità. [1][2]

| Elemento valutato | Evidenza e limite |
|---|---|
| Finalità concreta | Servire l'anteprima e limitare richieste automatizzate sugli endpoint pubblici. |
| Necessità tecnica | Prima di una sessione autenticata, i contatori per rete e globali permettono di applicare limiti. L'app non conserva l'IP in chiaro nelle proprie tabelle dei limiti. |
| Riduzione dei dati | Codice HMAC derivato dalla rete, contatori e finestre; il codice cambia giornalmente. Nessun dato di scelta o email di un nuovo visitatore viene inviato dalla composizione in draft. |
| Impatto e aspettative | Rischio di correlazione temporanea dei dati tecnici, distinto dalla valutazione delle carte. Nessuna pubblicità, analisi del pubblico o decisione significativa aggiunta dall'app. |
| Limiti residui | I codici restano pseudonimi; i fornitori possono registrare indirizzi IP e metadati. Una sessione precedente mantiene i propri percorsi di lettura/cancellazione. |
| Misure e diritti | Pulizia oraria delle finestre più vecchie di due giorni, schema privato, nessun identificativo nel link condiviso, recapito del titolare e informazioni dei fornitori accessibili. |

Questo è il registro della valutazione tecnica usata per predisporre l'anteprima; non è una certificazione legale e l'eventuale assenso alla pubblicazione non lo trasforma in tale. Un cambiamento di finalità, dati, fornitori o conservazione richiede una nuova valutazione.

## Conservazione: periodi distinti

- **Selezione locale:** fino alla cancellazione da parte del visitatore o dei dati del sito; non ha una scadenza automatica comune di 30 giorni.
- **Limiti applicativi:** il job orario rimuove le finestre più vecchie di due giorni.
- **Backup Supabase Pro:** la documentazione del piano prevede accesso agli ultimi sette giorni di backup giornalieri. Questa indicazione non attesta un ripristino già provato. [3]
- **Log dei fornitori:** seguono le rispettive politiche di servizio e sicurezza, con criteri legati alla finalità e agli obblighi applicabili. Non viene inventata una scadenza unica per ogni log. [4][5]

I **30 giorni confermati dall'utente** riguardano le future partecipazioni dalla fine dell'evento e le richieste catalogo dalla ricezione. Non vengono attribuiti retroattivamente a tutti i dati tecnici dell'anteprima.

## Configurazione e passaggio all'evento

Usare questa notice soltanto con `status='draft'`, `collection_ready=false` e `contact_enabled=false`. Prima di una modifica controllare anche che l'evento pubblico non contenga partecipazioni o richieste catalogo. Compilare nome, email, testo e versione non richiede di aprire la raccolta.

La pubblicazione dell'anteprima usa gli stessi controlli di CI, build e `check:release -- --production --check-backend` previsti dal workflow. Nessun controllo è rimosso o disattivato. Il dialogo in draft mostra questa informativa e i collegamenti ai fornitori, senza aggiungere paragrafi generici sul catalogo futuro.

Prima dell'apertura del 22–25 ottobre, sostituire il testo con quello definitivo dell'evento e completare le decisioni sulle nuove finalità, il PDF/servizio di invio, le prove sui telefoni e la preparazione operativa. Non aprire l'evento lasciando la versione `pre-event-2026-10-07-v1`.

## Fonti primarie

1. [GDPR](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679), art. 6, art. 13 e considerando 49.
2. [EDPB — Trattare i dati personali in modo lecito](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_it), condizioni dell'interesse legittimo.
3. [Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups), backup giornalieri e accesso ai sette giorni del piano Pro, verificato il 7 ottobre 2026.
4. [GitHub Pages — Data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) e [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
5. [Supabase — DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) e [Logs in Studio](https://supabase.com/docs/guides/observability/logs).
