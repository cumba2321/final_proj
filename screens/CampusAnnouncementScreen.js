import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db } from '../firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';

export default function CampusAnnouncementScreen() {
  const navigation = useNavigation();
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState('');

  // Safety check for db
  const announcementsCollectionRef = db ? collection(db, 'campusAnnouncements') : null;

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
        title: newAnnouncement,
        department: 'Admin',
        timestamp: new Date().toISOString(),
        priority: 'high',
        message: newAnnouncement,
        category: 'General',
      });
      setNewAnnouncement('');
      getAnnouncements();
    } catch (error) {
      console.error('Error adding announcement:', error);
    }
  };


  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#FF5252';
      case 'medium': return '#FF9800';
      case 'low': return '#4CAF50';
      default: return '#757575';
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Health & Safety': return '#E53E3E';
      case 'Academic': return '#3182CE';
      case 'Technology': return '#805AD5';
      case 'Events': return '#38A169';
      case 'Facilities': return '#D69E2E';
      default: return '#718096';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Campus Announcements</Text>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
      >
        <TouchableOpacity style={[styles.filterChip, styles.activeFilter]}>
          <Text style={[styles.filterText, styles.activeFilterText]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterText}>Academic</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterText}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterText}>Health & Safety</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterText}>Facilities</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Announcements List */}
      <ScrollView style={styles.content}>
        {announcements.map((announcement) => (
          <View key={announcement.id} style={styles.announcementCard}>
            {/* Priority Indicator */}
            <View style={[styles.priorityIndicator, { backgroundColor: getPriorityColor(announcement.priority) }]} />

            <View style={styles.cardContent}>
              <View style={styles.announcementHeader}>
                <View style={styles.headerTop}>
                  <Text style={styles.announcementTitle}>{announcement.title}</Text>
                  <View style={[styles.categoryTag, { backgroundColor: getCategoryColor(announcement.category) + '20' }]}>
                    <Text style={[styles.categoryText, { color: getCategoryColor(announcement.category) }]}>
                      {announcement.category}
                    </Text>
                  </View>
                </View>
                <View style={styles.headerBottom}>
                  <Text style={styles.department}>{announcement.department}</Text>
                  <Text style={styles.timestamp}>{announcement.timestamp}</Text>
                </View>
              </View>

              <Text style={styles.announcementText}>
                {announcement.message}
              </Text>

              <View style={styles.announcementActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>📌</Text>
                  <Text style={styles.actionText}>Pin</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>📤</Text>
                  <Text style={styles.actionText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>🔔</Text>
                  <Text style={styles.actionText}>Notify</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
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
  filterButton: {
    padding: 8,
  },
  filterIcon: {
    fontSize: 20,
    color: '#666',
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    marginRight: 8,
  },
  activeFilter: {
    backgroundColor: '#E75C1A',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeFilterText: {
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  announcementCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  priorityIndicator: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  announcementHeader: {
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  headerBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  department: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E75C1A',
  },
  timestamp: {
    fontSize: 12,
    color: '#888',
  },
  announcementText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 16,
  },
  announcementActions: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
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
