# BIG MATCH — stato della consegna

Registro aggiornato il 7 ottobre 2026 (Europe/Rome). L'anteprima è stata pubblicata tramite GitHub Pages dal commit `95b73063b53764263d8b5b1609e301c174528368`, dopo l'integrazione delle PR #1 e #2. Il backend dedicato Supabase Pro è installato e ha superato il collaudo funzionale sul servizio reale. L'evento pubblico rimane draft: partecipazioni e richieste catalogo sono chiuse. Le evidenze qui registrate identificano le versioni verificate; per le revisioni successive consultare le [run di GitHub Actions](https://github.com/emilioquattrini/big-match/actions).

## Versione di partenza e lavoro preparato

- Repository: `emilioquattrini/big-match`.
- Commit di partenza: `f15e6aa53c266f1a793205245a4e92e8eda359c2`.
- Ramo di sviluppo: [`feat/big-match-production`](https://github.com/emilioquattrini/big-match/tree/feat/big-match-production).
- Pull request: [#1](https://github.com/emilioquattrini/big-match/pull/1), con stato corrente e cronologia dell'integrazione.
- Primo caricamento remoto: `9567df410530fdde13ccc77509cf31abe19f8811`; correzioni di focus/test: `01449c418309b33aea2ffba6eb4da344f34c8f89`; proporzioni delle carte e relative prove: `9f513be6aabb98b830417dc6a121ce2278efefcc`.
- Perimetro confermato: 13 carte ampliabili, telefoni personali dei visitatori, richiesta facoltativa del catalogo senza newsletter.

La nuova app include selezione e ricerca, composizione condivisibile, renderer PNG dedicato, matching su risposte persistenti, mappa aggregata, retry senza duplicati, conflitti di revisione, cancellazione della partecipazione, form catalogo separato, cache statica e procedura di aggiornamento. Frontend, schema SQL, API, test, artwork e documentazione operativa sono nel repository.

Il generatore `npm run catalog:sql` prepara l'estensione del catalogo per un evento draft. Gli ID già usati rimangono stabili; le edizioni che hanno raccolto risposte preservano il proprio mazzo. Il comando non si connette al database.

## Verifiche effettivamente eseguite

| Controllo | Esito | Significato |
|---|---|---|
| TypeScript frontend e Edge handler | Superato | Verifica statica del codice. |
| Suite applicativa e SQL | 56/56 superati | Domain, poster, storage, risposta API, RPC/Edge e generatore catalogo. PostgreSQL eseguito con PGlite; Auth e trasporto remoto simulati. |
| Cache e pacchetto statico | 9/9 superati | Scope, bypass delle API, installazione completa, aggiornamenti e controllo dei file pubblici. |
| Build e controllo release | Superati localmente e in CI | Artefatto compilato di 25 file; la CI usa esclusivamente configurazione e credenziali fittizie. Versione e dimensioni sono riportate nel log della run. |
| Dipendenze npm | Nessuna vulnerabilità segnalata nell'audit eseguito | Fotografia del registro al momento della verifica; non certifica l'assenza di vulnerabilità. |
| Suite browser | 48/48 superati, senza retry | [Run delle correzioni finali](https://github.com/emilioquattrini/big-match/actions/runs/37539548778), commit `c51fb3f`: 16 scenari su Chromium, Chromium mobile e WebKit. Anche i controlli del codice, i 56 test applicativi/SQL e i 9 test cache sono superati nella stessa run. |
| CI della preparazione hosted | Superata | [Run 37541220504](https://github.com/emilioquattrini/big-match/actions/runs/37541220504), commit `9279bcf414e10bdd56ed609b4bcd59d7fc4520d1`: 56 test applicativi/SQL, 9 cache e 48 browser, senza errori, skip o retry. |
| Build con progetto Supabase reale | Superata | 25 file, 615.792 byte, versione `ac48e8879f0cf244`; controllo locale `--production` superato. Il gate aggiuntivo `--check-backend` rileva l'informativa pubblica incompleta e impedisce il rilascio. |
| Build della nota prima delle carte | Superata | TypeScript, build e controllo locale `--production` del 7 ottobre: 25 file, 615.849 byte, versione `7493c25c04cc33b9`. Questa verifica non pubblica il sito né completa l'informativa del backend. |
| CI della nota prima delle carte | Superata | [Run 37581794143](https://github.com/emilioquattrini/big-match/actions/runs/37581794143), commit `2ae929668c9808af3b616f7fb18b03a4c09d0516`, conclusa il 7 ottobre alle 08:31:51 Europe/Rome. Primo tentativo, tutti i 19 passaggi riusciti, comprese le suite applicative/SQL, cache e browser. |
| Integrazione in main | Completata e CI superata | PR #1 integrata nel commit `33db3e6801d1ce9587f4352e1cb3100a46d580f9`, con albero identico al candidato `38dfa17`. Anche la [CI del merge 37583450499](https://github.com/emilioquattrini/big-match/actions/runs/37583450499) è completata con successo. |
| Anteprima con backend configurato | Build e gate di rilascio superati | Il 7 ottobre: 25 file, 616.416 byte riportati dal release check, versione `87402c7fd6f82f4a`; `check:release -- --production --check-backend` superato dopo un timeout del primo tentativo locale. La verifica è in sola lettura e non crea partecipazioni o contatti. |
| CI della notice pre-evento | Superata | [Run 37587941850](https://github.com/emilioquattrini/big-match/actions/runs/37587941850), candidato `2cd50bf`, conclusa alle 09:34:42 Europe/Rome: 19 passaggi riusciti, 56 test applicativi/SQL, 9 cache e 51 browser, senza retry. Il nuovo scenario draft passa su Chromium, Chromium mobile e WebKit. La PR #2 è integrata nel commit `95b7306`, con albero identico `7552c4878621b2ea2f5a1642f43c02a1102830ea`. |
| Pubblicazione GitHub Pages | Completata | [Run 37588664938](https://github.com/emilioquattrini/big-match/actions/runs/37588664938), avviata dall'utente su `main`, conclusa alle 09:41:54 Europe/Rome al primo tentativo. Job validate/build/deploy superati, comprese le 51 prove browser e il gate reale del backend. Artefatto Pages `11467093690`, versione `87402c7fd6f82f4a`. URL: https://emilioquattrini.github.io/big-match/. |
| Sito pubblico dopo il deploy | Verificato | Alle 09:44:33 Europe/Rome: 24 file pubblici richiesti via HTTP, tutti 200 e identici byte per byte al pacchetto locale, comprese le 13 carte. Build/versione/configurazione coincidenti; SHA-256 dell'HTML `559b9d83c0dd6a70735ab1bf75ae3a1ae88c5e2f4a521608ec8443ebfafea041`. API pubblica 200, CORS per l'origine GitHub Pages, evento draft, 13 carte attive, catalogo disabilitato e notice identica al file verificato. Nessuna sessione Auth, partecipazione o richiesta catalogo creata da questa verifica. |
| Gateway e Auth ospitati | Superati | `tests/hosted/smoke.mjs` sul progetto dedicato: 7 sessioni anonime reali, matching, revisioni, replay, autorizzazione, CORS, catalogo e cancellazione. Dettagli nella sezione Supabase. |
| Scheduler ospitato | Superato | Esecuzione reale di `bm_cleanup()` tramite job di verifica completata il 6 ottobre alle 23:28:00 UTC. Il job temporaneo si è rimosso; quello orario resta attivo. |

Le prove browser del poster hanno scaricato PNG reali a 1080×1920 su tutti e tre i profili. Sono stati ispezionati i tre poster e le sei viewport di selezione/risultato: illustrazioni intere, proporzioni corrette, titoli e azioni leggibili. Le [evidenze visive finali](https://github.com/emilioquattrini/big-match/actions/runs/37539548778/artifacts/11447768476) confermano anche logo leggibile e assenza di un falso avviso di aggiornamento al primo caricamento. Le 24 diagnostiche del contratto API riportano zero richieste inattese. Le prove su iPhone e Android fisici restano distinte dall'emulazione.

La [prima CI](https://github.com/emilioquattrini/big-match/actions/runs/37535902187), con 37/48 prove superate, ha rilevato un problema reale del focus ai limiti del dialogo e incompatibilità del banco di prova WebKit con service worker e richieste simulate. La [seconda run](https://github.com/emilioquattrini/big-match/actions/runs/37537459648), 48/48, ha confermato la correzione del focus con i test invariati. I test HTTP isolano i mock dal worker; la prova WebKit di recupero spegne un'origine locale e richiede risposta del worker, mentre Chromium mantiene l'emulazione offline. Motivazioni e limiti sono in [ACCEPTANCE.md](ACCEPTANCE.md).

L'ispezione delle prime immagini ha rilevato un'ulteriore regressione grafica: l'altezza HTML delle carte rimaneva fissa a 640 px quando la larghezza si riduceva. Il CSS ora adatta l'altezza e conserva tutta l'illustrazione. La run più recente verifica le proporzioni effettive delle 13 carte della griglia e delle tre carte del risultato, oltre a catturare separatamente le viewport della selezione e del dialogo.

La rifinitura successiva all'ispezione aggiunge uno sfondo rosa al logo bianco dell'header e sincronizza l'avviso di aggiornamento con lo stato effettivo del worker in attesa. Questa revisione è inclusa nel commit `c51fb3f` e nel collaudo finale superato sopra; il test del primo caricamento verifica che l'avviso rimanga nascosto dopo l'attivazione.

## Collegamenti e attività per il rilascio

### GitHub: collegamento risolto

Il collegamento è stato aggiornato dall'utente. Creazione del ramo, caricamento dei sorgenti e apertura della pull request sono riusciti. Il contenuto remoto è stato verificato confrontando l'hash dell'intero albero Git con quello locale; il commit del collaudo frontend finale usa l'albero `f25f685373e6d1ca7c1f34ca989191a9c4c5522f`. La pull request registra lo stato corrente dell'integrazione. Il merge su `main` esegue la CI; la pubblicazione richiede l'avvio distinto di `pages.yml` e tutti i suoi controlli.

### Progetto Supabase: installato e collaudato

L'utente ha completato il passaggio a **Pro** e creato **Big Match** nell'organizzazione **justcolors**. Piano, progetto e stato `ACTIVE_HEALTHY` sono stati verificati tramite il servizio; la dashboard conferma compute Micro e regione Francoforte (`eu-central-1`). Il riferimento progetto è `zwjzlzyqsqxqtjxhgmbs` e l'origine API è `https://zwjzlzyqsqxqtjxhgmbs.supabase.co`. Non sono stati attivati ulteriori componenti a pagamento.

Installazione effettiva:

- Migrazione applicativa `20261006232008_big_match.sql`, con contenuto identico alla versione portabile già collaudata. Il nome locale è stato allineato alla versione assegnata dal servizio; i 31 test backend passano dopo la rinomina.
- Seed delle 13 carte `impersonae-v1` e dell'evento pubblico `big-2026` in draft.
- Migrazione `20261006232609_big_match_retention_indexes.sql`: indici per la pulizia degli attori e il cascade delle ricevute catalogo. Non sono stati aggiunti indici ai piccoli elenchi del catalogo senza un percorso di accesso che li giustifichi.
- Migrazione `20261006232718_big_match_retention_schedule.sql`: `pg_cron` e job `big-match-retention`, attivo al minuto 17 di ogni ora UTC.
- Edge Function `big-match`, versione 1, stato `ACTIVE`, con autenticazione verificata dal codice per ogni rotta privata e gateway pubblico per le rotte previste.
- Origine consentita `https://emilioquattrini.github.io`, segreto casuale per gli identificatori temporanei dei limiti e accesso anonimo Auth attivo. Le chiavi server e il segreto non sono nel repository o nei file pubblici.

Le 11 tabelle private hanno RLS attiva. Nessuna delle 8 RPC pubbliche applicative è eseguibile dai ruoli browser `anon` o `authenticated`; il ruolo backend `service_role` dispone degli accessi previsti. Gli avvisi informativi sull'assenza di policy client sono coerenti con questo modello e non sono stati risolti concedendo accessi al browser.

Il collaudo hosted è terminato con codice 0 usando esclusivamente la chiave pubblicabile e un evento sintetico dedicato. Ha verificato configurazione, contatori inizialmente a zero, ETag/304, CORS e preflight, accesso privato senza token rifiutato, sette sessioni anonime reali, matching noto `exact=1` e `close=3`, aggiornamenti, replay idempotenti, conflitti 409, dati invalidi 400, RPC dirette inaccessibili, richiesta catalogo senza sessione aggiuntiva, cancellazione ripetibile e rifiuto 410 degli invii tardivi.

La verifica SQL finale delle 23:32:46 UTC conferma: **evento pubblico draft, raccolta e catalogo disabilitati, zero risposte, zero richieste, versione aggregati 0**. L'evento di collaudo è stato chiuso: zero risposte e zero ricevute contenenti vecchie selezioni. Restano soltanto una richiesta catalogo sintetica `.invalid`, sette tombstone e i relativi utenti anonimi tracciati, soggetti alla retention di un giorno del test. Nessun contatto reale è stato usato.

Il processo pianificato è stato provato tramite un job temporaneo che ha chiamato realmente `bm_cleanup()` e si è rimosso dopo il successo. `cron.job_run_details` registra `succeeded` dalle 23:28:00.023622 alle 23:28:00.034411 UTC; la successiva lettura di `cron.job` mostra solo il job orario previsto. Questa prova dimostra l'esecuzione dello scheduler, non attesta ancora un ripristino da backup o la scadenza futura dei record del collaudo.

La quota Auth osservata in dashboard è ancora **30 nuovi utenti anonimi/ora/IP**. Serve conoscere affluenza prevista e uso del Wi-Fi condiviso per dimensionarla e provarla. Non è stato attivato CAPTCHA perché il frontend attuale non implementa quel percorso.

### Dati di pubblicazione e catalogo

Il 7 ottobre l'utente ha indicato **Chiara Zhu** come titolare e confermato **chiara.czhu@gmail.com** come recapito. Entrambi sono registrati nella configurazione dell'evento `big-2026` e verificati con una lettura SQL successiva all'aggiornamento. Ha inoltre scelto **30 giorni di conservazione**, già corrispondenti alla configurazione, e **Chiara come responsabile dell'invio manuale del catalogo**. La [bozza dell'informativa dell'evento](PRIVACY_NOTICE_DRAFT.md) e la [procedura catalogo](CATALOGUE_OPERATIONS.md) registrano queste scelte; restano il completamento del testo per l'apertura, il PDF da inviare e il servizio di invio. Il form registra una richiesta; non invia automaticamente email e non iscrive a una newsletter.

La nota sulla raccolta viene ora mostrata prima della griglia delle carte e spiega che la terza scelta invia la risposta quando l'evento è aperto. Il collegamento all'informativa è quindi disponibile prima dell'azione che può avviare l'invio.

Per la pagina precedente all'evento è stata preparata e registrata nel backend una [notice specifica](PRIVACY_PRE_EVENT.md), versione `pre-event-2026-10-07-v1`, che descrive composizioni locali e dati tecnici con raccolta disabilitata. L'aggiornamento ha modificato soltanto testo e versione, con guardie su stato draft, flag disabilitati, titolare/recapito attesi e assenza di risposte o richieste. La lettura successiva conferma il testo identico al [file inglese](privacy-pre-event.en.txt), 2.847 caratteri, `collection_ready=false`, `contact_enabled=false`, zero risposte e zero richieste. La bozza della notice per partecipazioni e catalogo resta distinta e deve essere completata prima dell'apertura.

### Verifica finale e pubblicazione

Prima della raccolta pubblica restano: informativa e procedura catalogo definitive, prova su telefoni reali, quota Auth sul Wi-Fi condiviso e prova di ripristino. L'utente ha confermato il passaggio a **Pages Source: GitHub Actions** il 7 ottobre; la conferma è dell'utente, non una lettura API dell'impostazione. Pubblicare soltanto `dist/` compilato. Il connettore GitHub gestisce codice/PR/CI ma non espone le impostazioni Pages, le variabili repository o l'avvio manuale di un workflow. La [guida di configurazione](GITHUB_PAGES_SETUP.md) documenta i cinque valori comunicati all'utente. Le istruzioni complete sono in [RELEASE.md](RELEASE.md) e i criteri in [ACCEPTANCE.md](ACCEPTANCE.md).

Alle 09:14 Europe/Rome l'utente ha confermato anche l'inserimento delle cinque variabili. La pipeline di pubblicazione conclusa alle 09:41:54 ne ha verificato l'uso effettivo nella build e nel controllo del backend. Si tratta di una verifica della pipeline, non di una lettura API delle impostazioni.

## Ripresa del lavoro

1. Completare la bozza dell'informativa e preparare il PDF/servizio di invio del catalogo; dimensionare Auth con i dati di affluenza/rete. Titolare, recapito, retention di 30 giorni e operatrice Chiara sono confermati.
2. Completare le prove sui telefoni fisici, sulla rete condivisa e di ripristino. La pubblicazione dell'anteprima e la verifica delle variabili sono concluse.
3. Sostituire la notice pre-evento e aprire la raccolta soltanto dopo aver completato i prerequisiti applicabili. Le future pubblicazioni continuano a richiedere l'avvio esplicito del workflow, la verifica del ramo/tag, la CI e il controllo del backend.

Questo registro va aggiornato con commit remoto, pull request, run CI e prove effettive quando le dipendenze vengono risolte.
