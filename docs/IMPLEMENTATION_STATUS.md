# BIG MATCH — stato della consegna

Registro aggiornato il 7 ottobre 2026 (Europe/Rome). Il codice è implementato, pubblicato nel ramo di sviluppo e sottoposto a collaudo automatico su GitHub. Le evidenze qui registrate identificano il commit verificato; per le revisioni successive consultare i [controlli correnti della pull request](https://github.com/emilioquattrini/big-match/pull/1/checks). Non costituisce una dichiarazione di rilascio in produzione.

## Versione di partenza e lavoro preparato

- Repository: `emilioquattrini/big-match`.
- Commit di partenza: `f15e6aa53c266f1a793205245a4e92e8eda359c2`.
- Ramo di sviluppo: [`feat/big-match-production`](https://github.com/emilioquattrini/big-match/tree/feat/big-match-production).
- Pull request draft: [#1](https://github.com/emilioquattrini/big-match/pull/1).
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

Le prove browser del poster hanno scaricato PNG reali a 1080×1920 su tutti e tre i profili. Sono stati ispezionati i tre poster e le sei viewport di selezione/risultato: illustrazioni intere, proporzioni corrette, titoli e azioni leggibili. Le [evidenze visive finali](https://github.com/emilioquattrini/big-match/actions/runs/37539548778/artifacts/11447768476) confermano anche logo leggibile e assenza di un falso avviso di aggiornamento al primo caricamento. Le 24 diagnostiche del contratto API riportano zero richieste inattese. Le prove su iPhone e Android fisici restano distinte dall'emulazione.

La [prima CI](https://github.com/emilioquattrini/big-match/actions/runs/37535902187), con 37/48 prove superate, ha rilevato un problema reale del focus ai limiti del dialogo e incompatibilità del banco di prova WebKit con service worker e richieste simulate. La [seconda run](https://github.com/emilioquattrini/big-match/actions/runs/37537459648), 48/48, ha confermato la correzione del focus con i test invariati. I test HTTP isolano i mock dal worker; la prova WebKit di recupero spegne un'origine locale e richiede risposta del worker, mentre Chromium mantiene l'emulazione offline. Motivazioni e limiti sono in [ACCEPTANCE.md](ACCEPTANCE.md).

L'ispezione delle prime immagini ha rilevato un'ulteriore regressione grafica: l'altezza HTML delle carte rimaneva fissa a 640 px quando la larghezza si riduceva. Il CSS ora adatta l'altezza e conserva tutta l'illustrazione. La run più recente verifica le proporzioni effettive delle 13 carte della griglia e delle tre carte del risultato, oltre a catturare separatamente le viewport della selezione e del dialogo.

La rifinitura successiva all'ispezione aggiunge uno sfondo rosa al logo bianco dell'header e sincronizza l'avviso di aggiornamento con lo stato effettivo del worker in attesa. Questa revisione è inclusa nel commit `c51fb3f` e nel collaudo finale superato sopra; il test del primo caricamento verifica che l'avviso rimanga nascosto dopo l'attivazione.

## Collegamenti e attività per il rilascio

### GitHub: collegamento risolto

Il collegamento è stato aggiornato dall'utente. Creazione del ramo, caricamento dei sorgenti e apertura della pull request sono riusciti. Il contenuto remoto è stato verificato confrontando l'hash dell'intero albero Git con quello locale; il commit del collaudo frontend finale usa l'albero `f25f685373e6d1ca7c1f34ca989191a9c4c5522f`. La pull request rimane draft e il ramo principale non è stato modificato.

### Progetto Supabase

L'utente ha confermato l'organizzazione per un nuovo progetto dedicato a BIG MATCH. La lettura dell'organizzazione riesce e riporta il piano Free; la lista progetti è vuota. Nessun progetto ospitato è stato creato o configurato da questa consegna.

La verifica del costo tramite il collegamento restituisce `UNAVAILABLE`: il server non espone il comando richiesto. Il comando di creazione disponibile richiede ancora una conferma di costo valida. Il piano dell'organizzazione non è stato trattato come un preventivo e nessuna creazione è stata tentata. Occorre completare la verifica del costo e la creazione tramite un percorso supportato, poi configurare Auth/Edge, applicare migrazione e seed e verificare il servizio. Le chiavi server non appartengono al repository o ai file pubblici.

Il collaudo manuale `tests/hosted/smoke.mjs` prepara e verifica un evento sintetico dedicato con slug `smoke-<UUID>`. Usa soltanto una chiave pubblicabile, rifiuta l'evento pubblico e non parte nelle suite automatiche. Il suo passaggio sul servizio ospitato resta da eseguire: la preparazione del test non dimostra che Auth o il gateway siano già configurati.

### Dati di pubblicazione e catalogo

Da confermare con il responsabile: titolare e recapito reali per l'informativa, testo e versione dell'informativa, periodo di conservazione, finestra di raccolta ed evasione delle richieste del catalogo. Il form registra una richiesta; non invia automaticamente email e non iscrive a una newsletter.

### Verifica finale e pubblicazione

Prima della raccolta pubblica: prova hosted su ambiente di test, prova su telefoni reali, quota Auth sul Wi-Fi condiviso, procedura di conservazione/ripristino e configurazione GitHub Pages. Il nuovo sorgente Vite richiede **Pages Source: GitHub Actions prima del merge**; pubblicare soltanto `dist/` compilato. Le istruzioni sono in [RELEASE.md](RELEASE.md) e i criteri in [ACCEPTANCE.md](ACCEPTANCE.md).

## Ripresa del lavoro

1. Completare verifica del costo e creazione del progetto Supabase nell'organizzazione confermata, poi configurazione e prove hosted.
2. Inserire i dati approvati dell'evento e dell'informativa; verificare il percorso catalogo.
3. Completare le prove sui telefoni e pubblicare la versione verificata mediante il workflow previsto.

Questo registro va aggiornato con commit remoto, pull request, run CI e prove effettive quando le dipendenze vengono risolte.
