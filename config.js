// Configurazione — da compilare dopo la registrazione Microsoft (Entra ID)
window.APP_CONFIG = {
  clientId: "2c827db4-adae-400f-8e84-75cf7c174784",
  // "consumers" = solo account Microsoft personali (e_pedrotti@outlook.it)
  authority: "https://login.microsoftonline.com/consumers",
  // Percorso relativo alla cartella speciale "Documenti" di OneDrive
  baseFolder: "LaDelfina Srls/Banca/Ricevute e scontrini/00 - Da elaborare",
  persons: ["Emanuele", "Francesca"],
  // Metodi di pagamento (facoltativo); "Altro" chiede un testo libero
  payments: ["Carta Nexi", "Revolut", "Bonifico", "Contanti", "Altro"],
  // Categorie del commercialista; "conChi" = chiede con chi / per quale cliente
  categories: [
    { label: "Ristorante", code: "RIST", conChi: true },
    { label: "Spese di rappresentanza", code: "RAPP", conChi: true },
    { label: "Spese viaggio", code: "VIAG" },
    { label: "Spese per evento", code: "EVEN" },
    { label: "Campioni", code: "CAMP" },
    { label: "Software e abbonamenti", code: "SOFT" },
    { label: "Consulenze e servizi", code: "CONS" },
    { label: "Merci", code: "MERC" },
    { label: "Altro", code: "ALTR" }
  ]
};
