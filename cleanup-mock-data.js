// Cleanup script to remove mock/test data from Firebase
// Run this with: node cleanup-mock-data.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';

// Firebase configuration
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
const db = getFirestore(app);

async function cleanupMockData() {
  console.log('🧹 Starting cleanup of mock/test data...');
  
  try {
    // Define patterns that identify mock/test data
    const mockPatterns = [
      'hello',
      'test',
      'sample',
      'mock',
      'Prof. User',
      'Test User',
      'dummy'
    ];
    
    // Collections to clean
    const collections = ['campusAnnouncements', 'sectionAnnouncements'];
    
    let totalDeleted = 0;
    
    for (const collectionName of collections) {
      console.log(`\n📋 Checking ${collectionName} collection...`);
      
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      
      console.log(`Found ${snapshot.docs.length} documents in ${collectionName}`);
      
      for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data();
        const docId = docSnapshot.id;
        
        // Check if this document contains mock data
        const isMockData = mockPatterns.some(pattern => {
          const title = (data.title || '').toLowerCase();
          const message = (data.message || '').toLowerCase();
          const author = (data.authorEmail || data.author || '').toLowerCase();
          
          return title.includes(pattern.toLowerCase()) ||
                 message.includes(pattern.toLowerCase()) ||
                 author.includes(pattern.toLowerCase());
        });
        
        if (isMockData) {
          console.log(`🗑️  Deleting mock announcement: "${data.title || data.message}" by ${data.authorEmail || data.author || 'Unknown'}`);
          
          // Delete the document
          await deleteDoc(doc(db, collectionName, docId));
          totalDeleted++;
        } else {
          console.log(`✅ Keeping real announcement: "${data.title || data.message}" by ${data.authorEmail || data.author || 'Unknown'}`);
        }
      }
    }
    
    console.log(`\n🎉 Cleanup complete! Deleted ${totalDeleted} mock announcements.`);
    
    if (totalDeleted === 0) {
      console.log('✨ No mock data found - your database is already clean!');
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
  
  process.exit(0);
}

// Run the cleanup
cleanupMockData();