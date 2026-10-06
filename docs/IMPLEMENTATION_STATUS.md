# BIG MATCH — stato della consegna

Registro del 6 ottobre 2026. Questa consegna contiene il codice implementato e verificato localmente. Non costituisce una dichiarazione di rilascio in produzione.

## Versione di partenza e lavoro preparato

- Repository: `emilioquattrini/big-match`.
- Commit di partenza: `f15e6aa53c266f1a793205245a4e92e8eda359c2`.
- Ramo di sviluppo locale: `feat/big-match-production`.
- Perimetro confermato: 13 carte ampliabili, telefoni personali dei visitatori, richiesta facoltativa del catalogo senza newsletter.

La nuova app include selezione e ricerca, composizione condivisibile, renderer PNG dedicato, matching su risposte persistenti, mappa aggregata, retry senza duplicati, conflitti di revisione, cancellazione della partecipazione, form catalogo separato, cache statica e procedura di aggiornamento. Frontend, schema SQL, API, test, artwork e documentazione operativa sono nel repository.

Il generatore `npm run catalog:sql` prepara l'estensione del catalogo per un evento draft. Gli ID già usati rimangono stabili; le edizioni che hanno raccolto risposte preservano il proprio mazzo. Il comando non si connette al database.

## Verifiche effettivamente eseguite

| Controllo | Esito | Significato |
|---|---|---|
| TypeScript frontend e Edge handler | Superato | Verifica statica del codice. |
| Suite applicativa e SQL | 56/56 superati | Domain, poster, storage, risposta API, RPC/Edge e generatore catalogo. PostgreSQL eseguito con PGlite; Auth e trasporto remoto simulati. |
| Cache e pacchetto statico | 9/9 superati | Scope, bypass delle API, installazione completa, aggiornamenti e controllo dei file pubblici. |
| Build e controllo release locale | Superati | Artefatto compilato di 25 file, privo di configurazione Supabase reale. |
| Dipendenze npm | Nessuna vulnerabilità segnalata nell'audit eseguito | Fotografia del registro al momento della verifica; non certifica l'assenza di vulnerabilità. |
| Suite browser | 16 scenari, 48 esecuzioni previste; typecheck e scoperta superati | Esecuzione non effettuata. Non è ancora disponibile una prova browser del PNG o dei flussi completi. |

Le prove unitarie del poster verificano il renderer con API canvas simulate. Il test browser previsto verifica un PNG realmente scaricato a 1080×1920: finché non viene eseguito, dimensioni native e resa visuale non sono dichiarate verificate in un browser. Le prove su iPhone e Android fisici restano distinte dall'emulazione.

## Dipendenze esterne ancora aperte

### Scrittura GitHub

Il tentativo di creare il ramo attraverso il collegamento GitHub ha ricevuto HTTP 403, `Resource not accessible by integration`. Il ramo remoto e la pull request non sono stati creati; nessuna run CI è stata avviata. Occorre aggiornare l'accesso del collegamento al repository per consentire le operazioni necessarie. Non sono state tentate scritture attraverso canali alternativi dopo il rifiuto.

### Progetto Supabase

Nessun progetto ospitato è stato configurato da questa consegna. La migrazione e il seed sono pronti; occorrono collegamento all'account, progetto di destinazione, configurazione Auth/Edge, migrazione e verifiche del servizio. Le chiavi server non appartengono al repository o ai file pubblici.

### Dati di pubblicazione e catalogo

Da confermare con il responsabile: titolare e recapito reali per l'informativa, testo e versione dell'informativa, periodo di conservazione, finestra di raccolta ed evasione delle richieste del catalogo. Il form registra una richiesta; non invia automaticamente email e non iscrive a una newsletter.

### Verifica finale e pubblicazione

Prima della raccolta pubblica: CI browser, prova hosted su ambiente di test, prova su telefoni reali, quota Auth sul Wi-Fi condiviso, procedura di conservazione/ripristino e configurazione GitHub Pages. Il nuovo sorgente Vite richiede **Pages Source: GitHub Actions prima del merge**; pubblicare soltanto `dist/` compilato. Le istruzioni sono in [RELEASE.md](RELEASE.md) e i criteri in [ACCEPTANCE.md](ACCEPTANCE.md).

## Ripresa del lavoro

1. Abilitare la scrittura del collegamento GitHub per questo repository e pubblicare il ramo di sviluppo.
2. Aprire la pull request draft, eseguire CI e risolvere eventuali regressioni browser.
3. Collegare Supabase e completare configurazione e prove hosted.
4. Inserire i dati approvati dell'evento e dell'informativa; verificare il percorso catalogo.
5. Completare le prove sui telefoni e pubblicare la versione verificata mediante il workflow previsto.

Questo registro va aggiornato con commit remoto, pull request, run CI e prove effettive quando le dipendenze vengono risolte.
