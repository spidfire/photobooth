  /**************************************/
/* 1) IndexedDB Setup & Utilities     */
/**************************************/

// We’ll create (or open) a database named "PhotoBoothDB" with an object store "failedUploads".
let db;
var filename = "notset.jpg"

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PhotoBoothDB", 1);

    request.onerror = (event) => {
      console.error("IndexedDB Error:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains("failedUploads")) {
        const objectStore = db.createObjectStore("failedUploads", { keyPath: "id", autoIncrement: true });
        // You could create indexes if you like, e.g. objectStore.createIndex("uploadDate", "uploadDate");
      }
    };
  });
}

function savePhotoIndexedDB(base64Data) {
  if (!db) {
    console.warn("IndexedDB not initialized yet!");
    return;
  }
  const tx = db.transaction("failedUploads", "readwrite");
  const store = tx.objectStore("failedUploads");
  const record = {
    photoData: base64Data,
    timeStamp: Date.now()
  };
  store.add(record);
  tx.oncomplete = () => {
    console.log("Photo saved to IndexedDB (fallback).");
  };
  tx.onerror = (e) => {
    console.error("Error storing photo in IndexedDB:", e.target.error);
  };
}

function getAllFailedUploads() {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.warn("IndexedDB not initialized yet!");
      resolve([]);
      return;
    }
    const tx = db.transaction("failedUploads", "readonly");
    const store = tx.objectStore("failedUploads");
    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve(event.target.result || []);
    };
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function removeEntryFromIndexedDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("failedUploads", "readwrite");
    const store = tx.objectStore("failedUploads");
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/******************************************/
/* 2) Camera & Countdown Setup            */
/******************************************/

const video = document.getElementById("camera");
const thumbnailsContainer = document.getElementById("thumbnails");
const countdownEl = document.getElementById("countdown");
const bottombarEl = document.getElementById("bottombar");
const lightboxEl = document.getElementById("lightbox");
const lightboxImageEl = document.getElementById("lightbox-image");

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
  } catch (err) {
    console.error("Error accessing the camera:", err);
  }
}

function openLightbox(base64Data, speed, closeCallback) {
  lightboxImageEl.src = base64Data;
  lightboxEl.style.display = "block";
  setTimeout(() => {
    lightboxEl.style.display = "none";
    if(closeCallback){
      closeCallback()
    }
  }, speed);
}

function doCountdown(seconds) {
  lightboxEl.style.display = "none";
  return new Promise((resolve) => {
    let counter = seconds;
    countdownEl.textContent = counter;
    const interval = setInterval(() => {
      counter--;
      if (counter <= 0) {
        clearInterval(interval);
        countdownEl.textContent = "";
        resolve();
      } else {
        countdownEl.textContent = counter;
      }
    }, 1000);
  });
}

function captureImage() {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/png");
}

/******************************************/
/* 3) Upload + Fallback Logic             */
/******************************************/

function fileNameGenerator(){
    function pad2(n) { return n < 10 ? '0' + n : n }

    var date = new Date();
        
    return date.getFullYear().toString() + pad2(date.getMonth() + 1) + pad2( date.getDate()) + pad2( date.getHours() ) + pad2( date.getMinutes() ) + pad2( date.getSeconds() );
}

// Attempt to upload to the server
async function uploadPhoto(base64Data) {
  try {

    // Call the main process to save the buffer
    const savedPath = await window.electronAPI.downloadImageFromBase64(base64Data, filename);

    console.log("Photo uploaded successfully to server.", savedPath);
    return true;
  } catch (error) {
    console.error("Upload error:", error);
    return false;
  }
}


/******************************************/
/* 4) Main Photo Capture Flow            */
/******************************************/

// <div class='polaroid' style='transform: rotate(-5deg);'>
//             <img class='thumbnail' src="http://localhost:8081/images/random/aec68c01-38bf-4f55-aa5a-18d146c124ab26-2.jpg" alt="Thumbnail 1">
//             #4
//         </div>


function displayThumbnail(base64Data, id) {
  const img = document.createElement("img");
  img.src = base64Data;
  img.className = "thumbnail";

  const polaroid = document.createElement("div");
    polaroid.className = "polaroid";
    polaroid.style.transform = `rotate(${Math.floor(Math.random() * 10) - 5}deg)`;
    polaroid.appendChild(img);
    polaroid.appendChild(document.createTextNode("#" + id));
    polaroid.addEventListener("click", () => openLightbox(base64Data, 3000));


  thumbnailsContainer.prepend(polaroid);

  // Keep only the last 4 thumbnails
  while (thumbnailsContainer.childNodes.length > 4) {
    thumbnailsContainer.removeChild(thumbnailsContainer.lastChild);
  }
}

async function takeFourPhotos() {
  let previewPhotos = [];
  for (let i = 0; i < 4; i++) {
      
    filename = fileNameGenerator() + '_' + i + '_screenshot.jpg'
    await doCountdown(3);
    const base64 = captureImage();
    displayThumbnail(base64, i+ 1);
    previewPhotos.push(base64);
    // Attempt immediate upload
    const success = await uploadPhoto(base64);
    if (!success) {
      // If upload fails, store in IndexedDB
      savePhotoIndexedDB(base64);
    }

  }

  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => {
      openLightbox(previewPhotos[i], 1000, () => resolve());
    });   
  }
  
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => {
      openLightbox(previewPhotos[i], 1000, () => resolve());
    });   
  }

}

/******************************************/
/* 5) Retry logic on page load           */
/******************************************/

async function retryIndexedDBUploads() {
  console.log("Retrying any failed uploads from IndexedDB...");
  try {
    const failedUploads = await getAllFailedUploads();
    for (const entry of failedUploads) {
      const { id, photoData } = entry;
      const success = await uploadPhoto(photoData);
      if (success) {
        // Remove from IndexedDB
        await removeEntryFromIndexedDB(id);
        console.log(`Successfully re-uploaded entry #${id} and removed it from IndexedDB.`);
      } else {
        console.warn(`Re-upload failed for entry #${id}. Keeping in IndexedDB.`);
      }
    }
  } catch (err) {
    console.error("Error retrying uploads:", err);
  }
}

/******************************************/
/* 6) Event Listeners & Initialization    */
/******************************************/

bottombarEl.addEventListener("click", takeFourPhotos);
video.addEventListener("click", takeFourPhotos);

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.keyCode === 32  || e.keyCode === 13) {
    takeFourPhotos();
  }
});

// On page load
window.addEventListener("DOMContentLoaded", async () => {
  // Initialize IndexedDB
  await initIndexedDB();

  // Initialize camera
  await initCamera();

  // Attempt to re-upload any failed photos stored in IDB
  await retryIndexedDBUploads();
});