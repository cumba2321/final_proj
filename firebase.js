// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBGDu508dtE8sRQmU6zxLhS9sU9L89uods",
  authDomain: "mobprog-bfaf3.firebaseapp.com",
  projectId: "mobprog-bfaf3",
  storageBucket: "mobprog-bfaf3.firebasestorage.app",
  messagingSenderId: "1080124389761",
  appId: "1:1080124389761:web:6c687d361fe8053d229080",
  measurementId: "G-8Z53DF8X4V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
export const db = getFirestore(app);

// Debug log to verify db initialization
console.log('Firebase initialized:', !!app);
console.log('Firestore db initialized:', !!db);
