import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB8ZwX5dS257jFvgWw5Xmg4o0NqAQhc8Hc",
  authDomain: "charismatic-tempest-jn50x.firebaseapp.com",
  projectId: "charismatic-tempest-jn50x",
  storageBucket: "charismatic-tempest-jn50x.firebasestorage.app",
  messagingSenderId: "168604708107",
  appId: "1:168604708107:web:1bbcb0e5cfc7a57fd0c60e"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, "ai-studio-groupmonny-d4903458-7068-46d5-b42d-842f16808e01");
