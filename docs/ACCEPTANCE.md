# BIG MATCH — piano di accettazione e registro delle prove

Aggiornato il 6 ottobre 2026. Gli ID AT01–AT25 mantengono la corrispondenza con il backlog dell’audit. **Un test scritto non è un test superato; un test locale non prova il servizio ospitato o un dispositivo fisico.**

## Stato delle evidenze

| Livello | Evidenza disponibile | Limite / prossimo passo |
|---|---|---|
| TypeScript | Controlli dell’app, test browser e handler compilabili senza emissione. | Ripetere sul commit finale del PR. |
| Domain, poster, storage, validazione, SQL/Edge e ampliamento catalogo | Ultima esecuzione locale coordinata: 56 test applicativi superati. | Auth e trasporto esterno sono simulati; PostgreSQL PGlite usa una connessione accodata. |
| Build e service worker | 9 test Node/VM superati: scope, installazione completa, bypass API, attivazione esplicita, pulizia limitata alle proprie cache e allowlist esatta delle licenze pubbliche. Build e controllo artefatto superati localmente. | Il VM non riproduce il lifecycle completo di Safari/Chrome. |
| Browser automatici | 16 scenari Playwright, 3 progetti, 48 esecuzioni previste. Scoperta della suite e typecheck verificabili senza browser. | Esecuzione da registrare in CI; browser locale non utilizzabile in questa sessione. Non sono dichiarati superati. |
| Servizi ospitati | Codice, migrazione e procedure presenti. | Nessun progetto Supabase, gateway/Auth o scheduler di produzione configurato/verificato da questa implementazione. |
| Dispositivi e fiera | Piano sotto. | Nessuna prova fisica iPhone/Android/iPad o rete della fiera dichiarata eseguita. |

Quando la CI esegue i browser, allegare il link della run e aggiornare questa tabella con l’esito effettivo. Non convertire automaticamente in “superato” un requisito che include ancora una prova hosted o fisica.

## Regressioni automatiche

`tests/e2e/app.spec.ts` copre il prefisso di pubblicazione, le 13 carte, ricerca/selezione, reveal annullato, focus del dialogo, riapertura, reload, una sola chiamata share, annullamento senza download, PNG reale, link pubblico e precaricamento offline.

`tests/e2e/community.spec.ts` usa il vero SDK del client con un gateway/Auth fittizio: prima risposta, reload senza doppio invio, ack perduto, stesso ID al retry, conflitto con caricamento della versione nuova, snapshot personale, GET tardivo dopo chiusura, link senza identità, form catalogo con errore e cancellazione con errore. La fixture non sostituisce i test di autorizzazione e transazione del backend.

Ogni contesto browser è isolato. Le richieste esterne sono intercettate o bloccate e gli indirizzi email delle prove terminano in `.invalid`. Report e immagini di CI contengono solo fixture. Il controllo PNG conserva il file nativo e una schermata del risultato; l’ispezione visiva rimane richiesta.

I comandi, le variabili della fixture e la pubblicazione sono in [RELEASE.md](RELEASE.md). Gli invarianti SQL e i limiti della prova sono in [BACKEND.md](BACKEND.md); provenienza dell’artwork e numerazione in [CATALOG.md](CATALOG.md).

## Criteri di accettazione

Le priorità P0/P1 seguono il piano approvato. Mappa, contatti/evasione e kiosk diventano gate P0 quando la funzione viene effettivamente offerta al pubblico. La mappa è presente in questa implementazione; i contatti devono restare disabilitati finché AT20 e AT21 non sono chiusi. Il kiosk non è incluso.

| ID | Priorità | Area e prova | Risultato atteso | Copertura / attività rimanente |
|---|---|---|---|---|
| AT01 | P0 | Selezione — Touch e tastiera scelgono 3 carte distinte; ricerca e rimozione coerenti. | 0/1/2 carte non producono partecipazione; quarta carta non aggiunta. | Browser: ricerca e stato selezione. Completare touch, quarta carta e tastiera su dispositivi reali. |
| AT02 | P0 | Transizione — Ripetere terzo tap, deselezione e reset in ogni fase del reveal. | Nessun TypeError, risultato parziale o callback obsoleta. | Browser: click 1→2→3→rimozione nello stesso turno, oltre la scadenza del reveal. Esito CI da registrare. |
| AT03 | P0 | Dialogo — Tab/Shift+Tab, Escape, X, VIEW MY MATCH e browser Back. | Focus contenuto e restituito; risultato sempre riapribile. | Browser: attraversamento Tab/Shift+Tab, chiusura e riapertura. Escape, Back e ritorno del focus da completare su Safari reale. |
| AT04 | P0 | DB — Inviare 0/1/2/4 carte, duplicate, inesistenti o di altro evento. Provare evento chiuso e versione catalogo incompatibile. | Richieste rifiutate; nessuna riga parziale. | SQL/Edge: vincoli reali e payload invalidi verificati localmente; configurazione hosted da provare. |
| AT05 | P0 | Matching — Fixture: ABC, ABC, ABD, ACD, BCD, AEF, DEF; analizzare prima ABC. | Exact=1; close=3; totale=4; AB/AC/BC=3 inclusa propria risposta. | Domain + SQL: fixture di 7 risposte verificata localmente. Browser controlla anche la resa di exact=1/close=3. |
| AT06 | P0 | Numerazione — Enumerare tutte le 22.100 terne di un mazzo 52 e i 6 ordini di ciascuna. | Codici distinti per terne distinte; stesso codice in ogni ordine. | Domain: unicità delle terne e indipendenza dall’ordine verificate localmente; il catalogo distribuito resta quello da 13 carte. |
| AT07 | P0 | Zero dati — Evento vuoto, primo partecipante, poi un secondo uguale. | Zero altre connessioni per il primo; un exact per ciascuno dopo il secondo. | SQL: zero e prima/seconda risposta. Browser: prima risposta e reload senza nuova scrittura. |
| AT08 | P0 | Idempotenza — 100 richieste concorrenti identiche; perdita risposta dopo commit e retry. | 1 partecipazione; stesso ack; nessun aumento spurio. I 429 di protezione non aggiungono effetti; cercare ricevuta prima della verifica revisione. | SQL: 100 replay sulla connessione PGlite. Browser: ack perduto e retry identico. Carico hosted su connessioni reali da eseguire. |
| AT09 | P0 | Conflitti — Stessa chiave con payload diverso; aggiornamento con revisione vecchia. | 409 e rilettura guidata; nessuna sovrascrittura silenziosa. | SQL/Edge: conflitti verificati. Browser: LOAD LATEST e risposta tardiva dopo chiusura. |
| AT10 | P0 | Permessi — Client A tenta accesso a dati B, lead, RPC diretta e kiosk non autorizzato. | Accesso negato senza esporre dati; rate limit non aggirabile via endpoint alternativo. | SQL/Edge: ruoli, RPC diretta, UID verificato e assenza route kiosk/admin. Gateway/Auth reali da verificare. |
| AT11 | P0 | Rete fiera — Molte sessioni nuove dietro lo stesso IP; quota e controlli spam configurati. | Flusso previsto supportato; 429 leggibile e recuperabile. | Da eseguire in staging con Auth reale e rete/IP condiviso. Non coperto dalla sola fixture. |
| AT12 | P0 | Share — Tap singolo, annullamento, assenza Web Share, doppio tap rapido. | 1 flusso; annulla non scarica; copia link/download disponibili. | Browser: una chiamata share e annullamento senza download. Share sheet nativo e fallback sui telefoni da verificare. |
| AT13 | P0 | PNG — Scaricare e aprire il PNG su iPhone/Android/desktop; ruotare durante generazione. | 1080×1920, tre carte giuste, nomi/URL leggibili, nessuna didascalia duplicata. | Poster unitario + browser: PNG scaricato e IHDR 1080×1920, allegato al report. Apertura file/qualità visiva sui telefoni da verificare. |
| AT14 | P0 | Concorrenza export — Share e download quasi insieme; reset durante generazione. | Stesso snapshot; UI non alterata; file obsoleto non sostituisce quello nuovo. | Renderer separato e gestione della generazione. Prova manuale di share/download/rotazione e cambio composizione da completare. |
| AT15 | P0 | Link e refresh — QR, link risultato, refresh diretto sul prefisso di produzione. | Pagina corretta; aprire link non crea partecipazione; nessuna credenziale nell'URL. | Browser: prefisso /big-match/, shared link senza signup/PUT e hash invalido. QR finale stampato da provare. |
| AT16 | P0 | Offline — Dispositivo precaricato: modalità aereo, reload e riavvio browser. | Carte e poster disponibili; dati live dichiarati indisponibili; nessun falso salvataggio. | Worker VM: precache e bypass. Browser: reload offline dopo installazione. Riavvio reale e disponibilità cache OS da verificare. |
| AT17 | P0 | Aggiornamenti — Client con cache precedente passa a release nuova, poi rollback. | Versione corretta senza perdere form/tentativo attivo; cambio tra sessioni. | Worker VM: nessun skip automatico, attivazione esplicita, cache precedente conservata. Update/rollback a due versioni reali da eseguire. |
| AT18 | P0 | Privacy — Cancellare una partecipazione due volte; eseguire retention in ambiente test. Cancellare con PUT in volo, poi ritentare il PUT. | Decremento una volta, sessioni scadute/Auth orfani trattati, aggregati coerenti. La vecchia richiesta non ricrea la partecipazione. | SQL/Edge: cancellazione, replay e retention verificati localmente. Browser: cancellazione fallita e retry. Scheduler hosted da verificare. |
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
| CI browser | Da compilare | Fixture locale in runner | Chromium / mobile Chromium / WebKit | Run CI | Da eseguire | URL run + report + PNG |
| GO alla raccolta | Da compilare | Produzione | Dispositivi previsti | Responsabile | Da eseguire | Tutti i gate applicabili chiusi |

Un P0 fallito o privo di prova prevista impedisce il GO alla raccolta. Per una funzione facoltativa è possibile mantenerla disabilitata e documentare la motivazione; non presentarla come disponibile. Il responsabile registra il via libera dopo le prove, senza confondere “codice implementato”, “CI superata”, “backend configurato” e “evento operativo”.
