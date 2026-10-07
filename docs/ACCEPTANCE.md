# BIG MATCH — piano di accettazione e registro delle prove

Aggiornato il 7 ottobre 2026. Gli ID AT01–AT25 mantengono la corrispondenza con il backlog dell’audit. **Un test scritto non è un test superato; un test locale non prova il servizio ospitato o un dispositivo fisico.** Ogni evidenza sotto identifica la propria revisione; le [run di GitHub Actions](https://github.com/emilioquattrini/big-match/actions) riportano i controlli delle revisioni successive. Il collaudo hosted, la CI e la pubblicazione dell'anteprima sono registrati in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Stato delle evidenze

| Livello | Evidenza disponibile | Limite / prossimo passo |
|---|---|---|
| TypeScript | Controlli dell’app, test browser e handler superati in CI sul commit `9f513be`. | Verifica statica; non sostituisce il collaudo hosted o fisico. |
| Domain, poster, storage, validazione, SQL/Edge e ampliamento catalogo | 56 test applicativi superati localmente e nella CI del commit `9f513be`. | Auth e trasporto esterno sono simulati; PostgreSQL PGlite usa una connessione accodata. |
| Build e service worker | 9 test Node/VM superati in CI: scope, installazione completa, bypass API, attivazione esplicita, pulizia limitata alle proprie cache e allowlist esatta delle licenze pubbliche. Build e controllo artefatto superati. | Il VM non riproduce il lifecycle completo di Safari/Chrome. |
| Browser automatici | 16 scenari Playwright × 3 profili: **48/48 superati senza retry**, Chromium, mobile Chromium e WebKit, nella [run 37538304056](https://github.com/emilioquattrini/big-match/actions/runs/37538304056). | API/Auth simulati. WebKit usa recupero con origine spenta, come spiegato sotto. Nessuna prova fisica iPhone/Android dichiarata. |
| Browser della versione pre-evento | 17 scenari × 3 profili: **51/51 superati senza retry** nella [CI del candidato](https://github.com/emilioquattrini/big-match/actions/runs/37587941850) e nella [pipeline Pages](https://github.com/emilioquattrini/big-match/actions/runs/37588664938) del commit `95b7306`. | Il nuovo scenario verifica selezione e PNG locali senza Auth, `/me`, `/contact` o scritture per un nuovo visitatore in draft. Mantiene i limiti di fixture e dispositivi fisici della riga precedente. |
| Pubblicazione dell'anteprima | Pipeline Pages completata alle 09:41:54 Europe/Rome: CI, build con variabili reali, gate backend e deploy superati al primo tentativo. Build `87402c7fd6f82f4a`. | Evento draft e catalogo disabilitato. La pubblicazione non costituisce il GO alla raccolta dell'evento. |
| Verifica HTTP della produzione | Alle 09:44:33 Europe/Rome, 24 file pubblici HTTP 200 e identici al pacchetto verificato; API pubblica 200, CORS corretto, 13 carte e notice attesa. | Sola lettura sul sito e sull'evento draft. Non è una prova del browser fisico o dell'invio di una partecipazione. |
| Servizi ospitati | Progetto Supabase Pro dedicato configurato; gateway/Auth, flusso funzionale con 7 identità sintetiche e scheduler verificati il 7 ottobre (Europe/Rome). | Evento pubblico draft a zero. Restano carico concorrente, rete condivisa, due schede hosted, ripristino e scadenza effettiva dei residui sintetici. Dettagli nel registro di implementazione. |
| Dispositivi e fiera | Piano sotto. | Nessuna prova fisica iPhone/Android/iPad o rete della fiera dichiarata eseguita. |

La [prima run](https://github.com/emilioquattrini/big-match/actions/runs/37535902187) aveva 37/48 esiti positivi. Le correzioni del focus e del banco di prova WebKit sono state confermate dalla run indicata sopra. Non convertire automaticamente in “superato” un requisito che include ancora una prova hosted o fisica.

## Regressioni automatiche

`tests/e2e/app.spec.ts` copre il prefisso di pubblicazione, le 13 carte, ricerca/selezione, reveal annullato, focus del dialogo, riapertura, reload, una sola chiamata share, annullamento senza download, PNG reale, link pubblico e precaricamento offline.

`tests/e2e/community.spec.ts` usa il vero SDK del client con un gateway/Auth fittizio: prima risposta, reload senza doppio invio, ack perduto, stesso ID al retry, conflitto con caricamento della versione nuova, snapshot personale, GET tardivo dopo chiusura, link senza identità, form catalogo con errore e cancellazione con errore. La fixture non sostituisce i test di autorizzazione e transazione del backend.

Ogni contesto browser è isolato. Le richieste esterne sono intercettate o bloccate e gli indirizzi email delle prove terminano in `.invalid`. Report e immagini di CI contengono solo fixture. Il controllo PNG conserva il file nativo e viewport separate del risultato e della selezione. I tre PNG e le sei viewport della run registrata sono stati ispezionati: proporzioni e contenuti corretti. L'URL localhost nel poster è intenzionale per la fixture.

L'ispezione della prima run verde ha rilevato carte troppo alte nell'interfaccia, nonostante il PNG esportato fosse corretto. La correzione CSS preserva proporzioni e illustrazioni. I test esistenti ora controllano la geometria effettiva delle 13 immagini della griglia e delle tre del risultato con tolleranza di un pixel; il numero di scenari rimane 16, eseguiti su tre profili.

Le prove HTTP in `community.spec.ts` impostano `serviceWorkers: 'block'` per mantenere le richieste intercettabili, secondo il [limite documentato di Playwright](https://playwright.dev/docs/network#missing-network-events-and-service-workers). Il worker resta attivo nella prova dedicata di precaricamento/recupero. Su Chromium questa usa l’emulazione offline; su WebKit 1.63 spegne invece un server locale isolato e verifica che un `fetch` con `no-store` fallisca prima di riaprire l’app dalla cache. La distinzione è necessaria per [l’errore upstream #42775](https://github.com/microsoft/playwright/issues/42775): non equivale a una prova di modalità aereo su Safari fisico, che rimane in AT16/AT23.

L’artefatto CI `browser-visuals-*` separa PNG, schermate del risultato e diagnostica essenziale dagli archivi trace. La diagnostica riporta metodo, origine/path, stato HTTP ed esito della richiesta, senza header, token, query string o contenuto del form. Gli archivi completi rimangono disponibili in `browser-regressions-*`.

I comandi, le variabili della fixture e la pubblicazione sono in [RELEASE.md](RELEASE.md). Gli invarianti SQL e i limiti della prova sono in [BACKEND.md](BACKEND.md); provenienza dell’artwork e numerazione in [CATALOG.md](CATALOG.md).

## Criteri di accettazione

Le priorità P0/P1 seguono il piano approvato. Mappa, contatti/evasione e kiosk diventano gate P0 quando la funzione viene effettivamente offerta al pubblico. La mappa è presente in questa implementazione; i contatti devono restare disabilitati finché AT20 e AT21 non sono chiusi. Il kiosk non è incluso.

| ID | Priorità | Area e prova | Risultato atteso | Copertura / attività rimanente |
|---|---|---|---|---|
| AT01 | P0 | Selezione — Touch e tastiera scelgono 3 carte distinte; ricerca e rimozione coerenti. | 0/1/2 carte non producono partecipazione; quarta carta non aggiunta. | Browser: ricerca e stato selezione. Completare touch, quarta carta e tastiera su dispositivi reali. |
| AT02 | P0 | Transizione — Ripetere terzo tap, deselezione e reset in ogni fase del reveal. | Nessun TypeError, risultato parziale o callback obsoleta. | Browser: click 1→2→3→rimozione nello stesso turno, oltre la scadenza del reveal. Superato sui tre profili della run registrata. |
| AT03 | P0 | Dialogo — Tab/Shift+Tab, Escape, X, VIEW MY MATCH e browser Back. | Focus contenuto e restituito; risultato sempre riapribile. | Browser: attraversamento Tab/Shift+Tab, chiusura e riapertura. Escape, Back e ritorno del focus da completare su Safari reale. |
| AT04 | P0 | DB — Inviare 0/1/2/4 carte, duplicate, inesistenti o di altro evento. Provare evento chiuso e versione catalogo incompatibile. | Richieste rifiutate; nessuna riga parziale. | SQL/Edge: matrice dei vincoli e payload invalidi verificata localmente. Hosted: configurazione e rifiuto 400 delle carte duplicate verificati; non equivale alla ripetizione remota dell'intera matrice. |
| AT05 | P0 | Matching — Fixture: ABC, ABC, ABD, ACD, BCD, AEF, DEF; analizzare prima ABC. | Exact=1; close=3; totale=4 connessioni; AB/AC/BC=3 inclusa propria risposta. | Domain + SQL: fixture verificata localmente. Hosted: 7 risposte, exact=1/close=3 e invarianti dei conteggi superati. Browser controlla anche la resa di exact=1/close=3. |
| AT06 | P0 | Numerazione — Enumerare tutte le 22.100 terne di un mazzo 52 e i 6 ordini di ciascuna. | Codici distinti per terne distinte; stesso codice in ogni ordine. | Domain: unicità delle terne e indipendenza dall’ordine verificate localmente; il catalogo distribuito resta quello da 13 carte. |
| AT07 | P0 | Zero dati — Evento vuoto, primo partecipante, poi un secondo uguale. | Zero altre connessioni per il primo; un exact per ciascuno dopo il secondo. | SQL: zero e prima/seconda risposta. Browser: prima risposta e reload senza nuova scrittura. |
| AT08 | P0 | Idempotenza — 100 richieste concorrenti identiche; perdita risposta dopo commit e retry. | 1 partecipazione; stesso ack; nessun aumento spurio. I 429 di protezione non aggiungono effetti; cercare ricevuta prima della verifica revisione. | SQL: 100 replay sulla connessione PGlite. Browser: ack perduto e retry identico. Carico hosted su connessioni reali da eseguire. |
| AT09 | P0 | Conflitti — Stessa chiave con payload diverso; aggiornamento con revisione vecchia. | 409 e rilettura guidata; nessuna sovrascrittura silenziosa. | SQL/Edge: conflitti verificati. Browser: LOAD LATEST e risposta tardiva dopo chiusura. |
| AT10 | P0 | Permessi — Client A tenta accesso a dati B, lead, RPC diretta e kiosk non autorizzato. | Accesso negato senza esporre dati; rate limit non aggirabile via endpoint alternativo. | SQL/Edge: ruoli, RPC diretta, UID verificato e assenza route kiosk/admin. Hosted: sessioni anonime, 401 senza token, RPC rifiutata sia anon sia authenticated, CORS/preflight superati. Il carico/abuso multi-connessione resta distinto. |
| AT11 | P0 | Rete fiera — Molte sessioni nuove dietro lo stesso IP; quota e controlli spam configurati. | Flusso previsto supportato; 429 leggibile e recuperabile. | Da eseguire in staging con Auth reale e rete/IP condiviso. Non coperto dalla sola fixture. |
| AT12 | P0 | Share — Tap singolo, annullamento, assenza Web Share, doppio tap rapido. | 1 flusso; annulla non scarica; copia link/download disponibili. | Browser: una chiamata share e annullamento senza download. Share sheet nativo e fallback sui telefoni da verificare. |
| AT13 | P0 | PNG — Scaricare e aprire il PNG su iPhone/Android/desktop; ruotare durante generazione. | 1080×1920, tre carte giuste, nomi/URL leggibili, nessuna didascalia duplicata. | Poster unitario + browser: PNG scaricato e IHDR 1080×1920, allegato al report. Apertura file/qualità visiva sui telefoni da verificare. |
| AT14 | P0 | Concorrenza export — Share e download quasi insieme; reset durante generazione. | Stesso snapshot; UI non alterata; file obsoleto non sostituisce quello nuovo. | Renderer separato e gestione della generazione. Prova manuale di share/download/rotazione e cambio composizione da completare. |
| AT15 | P0 | Link e refresh — QR, link risultato, refresh diretto sul prefisso di produzione. | Pagina corretta; aprire link non crea partecipazione; nessuna credenziale nell'URL. | Browser: prefisso /big-match/, shared link senza signup/PUT e hash invalido. QR finale stampato da provare. |
| AT16 | P0 | Offline — Dispositivo precaricato: modalità aereo, reload e riavvio browser. | Carte e poster disponibili; dati live dichiarati indisponibili; nessun falso salvataggio. | Worker VM: precache e bypass. CI: Chromium offline; WebKit con origine spenta e risposta SW verificata. Riavvio reale, modalità aereo Safari e disponibilità cache OS da verificare. |
| AT17 | P0 | Aggiornamenti — Client con cache precedente passa a release nuova, poi rollback. | Versione corretta senza perdere form/tentativo attivo; cambio tra sessioni. | Worker VM: nessun skip automatico, attivazione esplicita, cache precedente conservata. Update/rollback a due versioni reali da eseguire. |
| AT18 | P0 | Privacy — Cancellare una partecipazione due volte; eseguire retention in ambiente test. Cancellare con PUT in volo, poi ritentare il PUT. | Decremento una volta, sessioni scadute/Auth orfani trattati, aggregati coerenti. La vecchia richiesta non ricrea la partecipazione. | SQL/Edge: cancellazione, replay e retention verificati localmente. Browser: cancellazione fallita e retry. Hosted: DELETE ripetuto, PUT tardivo 410, sette risposte eliminate e scheduler riuscito. La scadenza futura di contatto/tombstone/Auth sintetici non è ancora osservata. |
| AT19 | P1 | Mappa — Dataset noto, zero dati, tab nascosto e movimento ridotto. | Pesi corretti, riepilogo testuale, no animazione o polling inutile. | Mappa di aggregati e riepilogo testuale implementati. Dati noti, tab nascosto, movimento ridotto e lettore schermo da completare. |
| AT20 | P1 | Contatti — Server 500, timeout dopo commit, retry, email invalida, nome/studio vuoti. | Nessun SENT su errore; lead unico su retry; campi facoltativi accettati. | SQL/Edge: persistenza/errore/idempotenza. Browser: 503, campi conservati, ID retry invariato e successo solo su ack. |
| AT21 | P1 | Evasione — Contatto di test ricevuto, esportato privatamente ed evaso. | Richiesta tracciabile; nessun accesso pubblico; nessuna newsletter implicita. | Da eseguire con operatore autorizzato in staging; nessuna email inviata dal codice o dai test. |
| AT22 | P1 | Kiosk — 50 visitatori consecutivi, form compilato, ricerca attiva, reset e risposta tardiva. | Nessun dato precedente; sessioni distinte; vecchia risposta non contamina la nuova. | Fuori dal perimetro corrente, orientato ai telefoni personali. NO-GO per un kiosk pubblico fino a implementazione e verifica dedicata. |
| AT23 | P0 | Dispositivi — iPad Safari, iPhone Safari, Android Chrome; tastiera desktop e QR stampato. | Percorso centrale completo; nessun errore bloccante su dispositivi reali. | Da eseguire su dispositivi fisici. Chromium mobile/WebKit desktop in CI non sono una prova su iPhone/iPad. |
| AT24 | P0 | Operatività — Restore backup test, rollback artefatto e controllo versione su tablet. | Procedura ripetibile dal responsabile; chiavi e PII assenti dagli output pubblici. | Controlli build/credenziali e workflow implementati. Restore backup e rollback operatore da provare nello staging. |
| AT25 | P0 | Snapshot coerente — Leggere risultato subito dopo commit con cache pubblica precedente; poi modificare la stessa risposta da altra scheda. | Terna, entry_revision e conteggi personali coerenti nello stesso snapshot; mai exact negativo o statistiche di una terna applicate a un'altra. | SQL: lettura coerente dopo commit/modifica. Browser: snapshot personale, conflitto e GET tardivo. Due schede contro hosted da completare. |

## Matrice dispositivi e reti

| Superficie | Percorso e condizioni | Evidenza da registrare |
|---|---|---|
| iPhone / Safari fisico | QR, scelta, modifica, PNG aperto, share annullato/riuscito, link condiviso, rotazione, rete mobile e modalità aereo dopo preload. | Modello, OS/Safari, rete, commit, file PNG e anomalie. |
| Android / Chrome fisico | Stesso percorso su dispositivo di fascia media; dimensione caratteri aumentata e riconnessione dopo errore. | Modello, Android/Chrome, rete, commit e screenshot. |
| iPad / Safari fisico, se previsto | Percorso del singolo visitatore, orientamenti, tastiera disponibile, memoria/cache e riapertura. Non usare come kiosk multiutente non verificato. | Modello/versioni e modalità d’uso dichiarata. |
| Desktop | Solo tastiera, Tab/Shift+Tab attraverso i confini del dialogo, Escape, Back, ricerca, 200% zoom e download. | Browser/versione, commit, registrazione del focus e layout. |
| Accessibilità assistita | VoiceOver su iPhone e/o TalkBack su Android; etichette, stato selezione, aggiornamenti e riepilogo numerico della mappa. | Esito leggibilità e operabilità, problemi con gravità. |
| Wi-Fi condiviso / rete lenta | Nuove sessioni al ritmo atteso; quota Auth, 429, perdita ack dopo commit, ritorno online e aggiornamento. | Ambiente staging, numero richieste, errori/tempi aggregati senza PII. |

Per le operazioni che scrivono usare prima lo staging separato. Limitare la prova di produzione alla verifica concordata dal responsabile; i test automatici non devono mai usare i dati o le credenziali reali.

## Prova di aggiornamento e rollback

1. Pubblicare la versione A nello staging su `/big-match/`, attendere l’installazione del worker e aprire due schede.
2. Scegliere le carte e compilare il form in una scheda. Nella seconda iniziare una richiesta di salvataggio ritardata.
3. Pubblicare la versione B. Verificare che non avvenga un reload autonomo e che UPDATE non sia utilizzabile durante draft/salvataggio/export/tentativi pendenti.
4. Terminare o risolvere le attività, accettare UPDATE e controllare la versione nuova, selezione conservata e API compatibili. La seconda scheda non deve ricaricarsi da sola.
5. Ripristinare A con la procedura di [RELEASE.md](RELEASE.md). Verificare il comportamento di un client già precaricato e di una visita pulita.
6. Ripetere reload offline e riavvio browser. Chiudere il requisito soltanto con evidenza del dispositivo/versione effettivi.

## Registro per il candidato al rilascio

Compilare una riga per ogni prova manuale/hosted; sono ammesse più righe per lo stesso ID. Valori esito: **Da eseguire / Superato / Fallito / Bloccato / Non applicabile con motivazione**.

| ID / gruppo | Commit o tag | Ambiente | Dispositivo / browser | Data e operatore | Esito | Prova allegata / problema |
|---|---|---|---|---|---|---|
| AT01–AT25 | Da compilare | Staging / produzione approvata | Da compilare | Da compilare | Da eseguire | — |
| CI browser | `9f513be` | Fixture locale in runner | Chromium / mobile Chromium / WebKit | 6 ottobre 2026 UTC, GitHub Actions | Superato, 48/48 senza retry | [Run](https://github.com/emilioquattrini/big-match/actions/runs/37538304056), report e `browser-visuals-*` con PNG/diagnostica |
| Ispezione visiva browser | `9f513be` | Artefatti CI | Tre poster e sei viewport dei profili sopra | 6 ottobre 2026 UTC, revisione delle immagini | Superato per proporzioni, contenuti e azioni | `browser-visuals-9f513be6aabb98b830417dc6a121ce2278efefcc`; il logo dell'header riceve inoltre uno sfondo rosa per migliorare il contrasto |
| GO alla raccolta | Da compilare | Produzione | Dispositivi previsti | Responsabile | Da eseguire | Tutti i gate applicabili chiusi |

Un P0 fallito o privo di prova prevista impedisce il GO alla raccolta. Per una funzione facoltativa è possibile mantenerla disabilitata e documentare la motivazione; non presentarla come disponibile. Il responsabile registra il via libera dopo le prove, senza confondere “codice implementato”, “CI superata”, “backend configurato” e “evento operativo”.
