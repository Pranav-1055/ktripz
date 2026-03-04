// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB74LX_VWFOkGxNC_8ImaqxVEoJkg4cadM",
    authDomain: "tripo-b2414.firebaseapp.com",
    databaseURL: "https://tripo-b2414-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tripo-b2414",
    storageBucket: "tripo-b2414.firebasestorage.app",
    messagingSenderId: "374903805664",
    appId: "1:374903805664:web:eeee9adad8a748ba47e285",
    measurementId: "G-ML678YB2R6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { app, analytics };
