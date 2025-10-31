// Temporary cleanup component - add this to your app and navigate to it once
// Remove this file after cleanup

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

export default function CleanupScreen() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);

  const scanForMockData = async () => {
    setLoading(true);
    try {
      const collections = ['campusAnnouncements', 'sectionAnnouncements'];
      let allAnnouncements = [];

      for (const collectionName of collections) {
        const snapshot = await getDocs(collection(db, collectionName));
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          collection: collectionName,
          ...doc.data()
        }));
        allAnnouncements = [...allAnnouncements, ...docs];
      }

      // Filter for potential mock data
      const mockPatterns = ['hello', 'test', 'sample', 'prof. user', 'dummy'];
      const mockData = allAnnouncements.filter(announcement => {
        const title = (announcement.title || '').toLowerCase();
        const message = (announcement.message || '').toLowerCase();
        const author = (announcement.authorEmail || announcement.author || '').toLowerCase();
        
        return mockPatterns.some(pattern => 
          title.includes(pattern) || 
          message.includes(pattern) || 
          author.includes(pattern)
        );
      });

      setAnnouncements(mockData);
      Alert.alert('Scan Complete', `Found ${mockData.length} potential mock announcements`);
    } catch (error) {
      console.error('Error scanning:', error);
      Alert.alert('Error', 'Failed to scan for mock data');
    }
    setLoading(false);
  };

  const deleteMockAnnouncement = async (announcement) => {
    try {
      await deleteDoc(doc(db, announcement.collection, announcement.id));
      setAnnouncements(prev => prev.filter(item => item.id !== announcement.id));
      Alert.alert('Success', 'Mock announcement deleted!');
    } catch (error) {
      console.error('Error deleting:', error);
      Alert.alert('Error', 'Failed to delete announcement');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mock Data Cleanup</Text>
      
      <TouchableOpacity 
        style={styles.scanButton} 
        onPress={scanForMockData}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Scanning...' : 'Scan for Mock Data'}
        </Text>
      </TouchableOpacity>

      <ScrollView style={styles.list}>
        {announcements.map((announcement) => (
          <View key={announcement.id} style={styles.item}>
            <Text style={styles.itemTitle}>
              {announcement.title || announcement.message || 'No title'}
            </Text>
            <Text style={styles.itemAuthor}>
              By: {announcement.authorEmail || announcement.author || 'Unknown'}
            </Text>
            <Text style={styles.itemCollection}>
              Collection: {announcement.collection}
            </Text>
            <Text style={styles.itemDate}>
              {announcement.timestamp || 'No date'}
            </Text>
            
            <TouchableOpacity 
              style={styles.deleteButton}
              onPress={() => deleteMockAnnouncement(announcement)}
            >
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {announcements.length === 0 && !loading && (
        <Text style={styles.emptyText}>No mock data found</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  scanButton: {
    backgroundColor: '#E75C1A',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
  },
  item: {
    backgroundColor: 'white',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 2,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  itemAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  itemCollection: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  itemDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  deleteButton: {
    backgroundColor: '#FF5252',
    padding: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  deleteText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginTop: 50,
  },
});