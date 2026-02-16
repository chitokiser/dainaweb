
// /public/assets/js/firebaseApp.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBLCL-sWi5ZvmEz0cdICULaJyUDyLdTGXg",
  authDomain: "daina-c8680.firebaseapp.com",
  projectId: "daina-c8680",
  storageBucket: "daina-c8680.firebasestorage.app",
  messagingSenderId: "891186616121",
  appId: "1:891186616121:web:20a91d3407783b84897ae8",
  measurementId: "G-31F6FT82ZR"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
