import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Button, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export default function CampusAnnouncementScreen() {
  const navigation = useNavigation();
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Safety check for db
  const announcementsCollectionRef = db ? collection(db, 'campusAnnouncements') : null;

  // Fetch user role from Firestore
  const fetchUserRole = async () => {
    const user = auth.currentUser;
    console.log('Fetching user role for:', user?.email); // Debug log
    
    if (user && db) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          console.log('User role found:', role); // Debug log
          setUserRole(role);
        } else {
          console.log('User document does not exist, creating default...'); // Debug log
          // If user document doesn't exist, default to student
          setUserRole('student');
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        if (error.code === 'permission-denied') {
          console.log('Permission denied, defaulting to student role');
          // Default to student role if permission denied
          setUserRole('student');
        } else {
          // For other errors, still default to student
          setUserRole('student');
        }
      }
    } else {
      console.log('No user or db available, defaulting to student'); // Debug log
      setUserRole('student');
    }
    setLoading(false);
  };

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
    fetchUserRole();
    getAnnouncements();
  }, []);

  const addAnnouncement = async () => {
    if (userRole !== 'instructor') {
      Alert.alert('Permission denied', 'Only instructors can post announcements.');
      return;
    }
    
    if (newAnnouncement.trim() === '' || !announcementsCollectionRef) return;
    try {
      const user = auth.currentUser;
      await addDoc(announcementsCollectionRef, {
        title: newAnnouncement,
        department: 'Admin',
        timestamp: new Date().toISOString(),
        priority: 'high',
        message: newAnnouncement,
        category: 'General',
        authorId: user?.uid,
        authorEmail: user?.email || 'Instructor'
      });
      setNewAnnouncement('');
      getAnnouncements();
    } catch (error) {
      console.error('Error adding announcement:', error);
      Alert.alert('Error', 'Failed to post announcement.');
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
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Campus Announcements</Text>
          {loading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : userRole ? (
            <View style={[styles.roleBadge, userRole === 'instructor' ? styles.instructorBadge : styles.studentBadge]}>
              <Text style={[styles.roleText, userRole === 'instructor' ? styles.instructorText : styles.studentText]}>
                {userRole === 'instructor' ? '👨‍🏫 Instructor' : '🎓 Student'}
              </Text>
            </View>
          ) : (
            <Text style={styles.loadingText}>No role found</Text>
          )}
        </View>
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
      
      {/* Add Announcement Section - Only for Instructors */}
      {userRole === 'instructor' && (
        <View style={styles.addAnnouncementContainer}>
          <TextInput
            style={styles.input}
            placeholder="Add new announcement"
            value={newAnnouncement}
            onChangeText={setNewAnnouncement}
          />
          <Button title="Post" onPress={addAnnouncement} />
        </View>
      )}
      
      {userRole === 'student' && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>Only instructors can post announcements</Text>
        </View>
      )}
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
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  instructorBadge: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
    borderWidth: 1,
  },
  studentBadge: {
    backgroundColor: '#E8F5E8',
    borderColor: '#4CAF50',
    borderWidth: 1,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  instructorText: {
    color: '#1976D2',
  },
  studentText: {
    color: '#388E3C',
  },
  loadingText: {
    fontSize: 10,
    color: '#666',
    fontStyle: 'italic',
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
    borderColor: '#E75C1A',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  infoContainer: {
    padding: 16,
    backgroundColor: '#f9f9f9',
    alignItems: 'center',
  },
  infoText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },
});
