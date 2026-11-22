let db;
const MAX_SEATS =50;
const req= indexedDB.open("EventpassDB",1);

req.upgradeneeded = (e) =>{
    db = e.target.result;
    const store = db.createObjectStore("tickets",{keypath :"id"});
    store.createIndex("email", "email", {unique:true});

};

req.onsucces= (e) =>{
    db = e.target.result;
    updateAdmin();

};

function Opentile(name){
    document.querySelectorAll(".tile").forEach((t) => t.classList.add("hidden"));
    document.getElementbyId("tile-" + name).classList.remove("hidden");
    updateAdmin();


}

