import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db } from '../firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';

export default function SectionAnnouncementScreen() {
  const navigation = useNavigation();
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState('');

  // Safety check for db
  const announcementsCollectionRef = db ? collection(db, 'sectionAnnouncements') : null;

  const getAnnouncements = async () => {
    if (!announcementsCollectionRef) return;
    try {
      const data = await getDocs(announcementsCollectionRef);
      setAnnouncements(data.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  useEffect(() => {
    getAnnouncements();
  }, []);

  const addAnnouncement = async () => {
    if (newAnnouncement.trim() === '' || !announcementsCollectionRef) return;
    try {
      await addDoc(announcementsCollectionRef, {
        professor: 'Prof. User',
        timestamp: new Date().toISOString(),
        message: newAnnouncement,
        likes: 0,
        comments: 0
      });
      setNewAnnouncement('');
      getAnnouncements();
    } catch (error) {
      console.error('Error adding announcement:', error);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Section Announcement</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Announcements List */}
      <ScrollView style={styles.content}>
        {announcements.map((announcement) => (
          <View key={announcement.id} style={styles.announcementCard}>
            <View style={styles.announcementHeader}>
              <View style={styles.profileIcon}>
                <Text style={styles.profileIconText}>👤</Text>
              </View>
              <View style={styles.announcementInfo}>
                <Text style={styles.professorName}>{announcement.professor}</Text>
                <Text style={styles.timestamp}>{announcement.timestamp}</Text>
              </View>
            </View>
            <Text style={styles.announcementText}>
              {announcement.message}
            </Text>
            <View style={styles.announcementActions}>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionIcon}>♡</Text>
                <Text style={styles.actionCount}>{announcement.likes}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionCount}>{announcement.comments}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add Announcement Section */}
        <View style={styles.addAnnouncementContainer}>
            <TextInput
            style={styles.input}
            placeholder="Add new announcement"
            value={newAnnouncement}
            onChangeText={setNewAnnouncement}
            />
            <Button title="Post" onPress={addAnnouncement} />
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  announcementCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileIconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  announcementInfo: {
    flex: 1,
  },
  professorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 13,
    color: '#888',
  },
  announcementText: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    marginBottom: 16,
  },
  announcementActions: {
    flexDirection: 'row',
    gap: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  actionIcon: {
    fontSize: 18,
    color: '#888',
  },
  actionCount: {
    fontSize: 14,
    color: '#888',
  },
  addAnnouncementContainer: {
      padding: 16,
      backgroundColor: '#fff',
  },
  input: {
      height: 40,
      borderColor: 'gray',
      borderWidth: 1,
      marginBottom: 10,
      paddingHorizontal: 10,
  },
});
