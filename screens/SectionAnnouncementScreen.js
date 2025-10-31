import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, doc, getDoc, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function SectionAnnouncementScreen() {
  const navigation = useNavigation();
  const [rawAnnouncements, setRawAnnouncements] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userClasses, setUserClasses] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  
  // Create announcement state
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    message: '',
    priority: 'medium',
    targetType: 'campus',
    targetClassId: null,
    targetClassName: '',
    targetSection: null
  });
  
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState('campus');
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);

  // Safety check for db
  const announcementsCollectionRef = db ? collection(db, 'sectionAnnouncements') : null;

  // Filter announcements based on user's classes using useMemo to prevent infinite loops
  const announcements = useMemo(() => {
    if (!rawAnnouncements.length) return [];
    
    const filteredAnnouncements = rawAnnouncements.filter(announcement => {
      // Campus announcements are visible to everyone
      if (announcement.targetType === 'campus') {
        return true;
      }
      
      // Section-specific announcements are only visible to users in that class/section
      if (announcement.targetType === 'section') {
        // Check if user is in the target class
        return userClasses.some(userClass => 
          userClass.id === announcement.targetClassId
        );
      }
      
      // Default: show the announcement
      return true;
    });
    
    console.log('🔍 Filtering announcements:', rawAnnouncements.length, '→', filteredAnnouncements.length);
    return filteredAnnouncements;
  }, [rawAnnouncements, userClasses]);

  // Fetch user authentication and role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const role = await fetchUserRole(user);
        if (role === 'instructor') {
          await fetchUserClasses(user);
        } else {
          await fetchUserEnrolledClasses(user);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Set up real-time listener for announcements
  useEffect(() => {
    // Only set up listener if user is logged in and has role
    if (!currentUser || !userRole || !announcementsCollectionRef) return;

    console.log('🔴 Setting up real-time listener for announcements');
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(announcementsCollectionRef, (snapshot) => {
      console.log('🔥 Real-time update received at:', new Date().toLocaleTimeString());
      setIsAutoRefreshing(true);
      setRefreshCount(prev => prev + 1);
      setLastRefreshTime(new Date());
      
      try {
        const fetchedAnnouncements = snapshot.docs.map((doc) => ({ 
          ...doc.data(), 
          id: doc.id 
        }));
        
        console.log('📨 Real-time announcements received:', fetchedAnnouncements.length);
        
        // Sort by timestamp (newest first)
        fetchedAnnouncements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setRawAnnouncements(fetchedAnnouncements);
        
        // Hide refresh indicator after a short delay
        setTimeout(() => setIsAutoRefreshing(false), 1000);
        
      } catch (error) {
        console.error('❌ Error processing real-time update:', error);
        setIsAutoRefreshing(false);
      }
    }, (error) => {
      console.error('❌ Real-time listener error:', error);
      setIsAutoRefreshing(false);
    });
    
    // Cleanup listener when component unmounts
    return () => {
      console.log('🔴 Cleaning up real-time listener');
      unsubscribe();
    };
  }, [currentUser?.uid, userRole]); // Only depend on user ID and role to avoid loops

  // Fetch user role from Firestore
  const fetchUserRole = async (user) => {
    if (user && db) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          setUserRole(role);
          return role;
        } else {
          setUserRole('student');
          return 'student';
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        setUserRole('student');
        return 'student';
      }
    }
    return 'student';
  };

  // Fetch classes where user is instructor
  const fetchUserClasses = async (user) => {
    if (user && db) {
      try {
        const classesCollection = collection(db, 'classes');
        const q = query(classesCollection, where('createdBy', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const classes = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUserClasses(classes);
        // Refresh announcements after classes are loaded
        setTimeout(() => getAnnouncements(), 100);
      } catch (error) {
        console.error('Error fetching user classes:', error);
      }
    }
  };

  // Fetch classes where user is enrolled (for students)
  const fetchUserEnrolledClasses = async (user) => {
    if (user && db) {
      try {
        const classesCollection = collection(db, 'classes');
        const q = query(classesCollection, where('students', 'array-contains', user.uid));
        const querySnapshot = await getDocs(q);
        const classes = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUserClasses(classes);
        // Refresh announcements after classes are loaded
        setTimeout(() => getAnnouncements(), 100);
      } catch (error) {
        console.error('Error fetching enrolled classes:', error);
      }
    }
  };

  const getAnnouncements = async () => {
    if (!announcementsCollectionRef) return;
    try {
      console.log('🔄 Manual refresh triggered at:', new Date().toLocaleTimeString());
      setRefreshing(true);
      // The real-time listener will handle the actual data fetching
      // This is just for manual pull-to-refresh visual feedback
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
    } catch (error) {
      console.error('Error in manual refresh:', error);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    console.log('📱 Pull-to-refresh triggered');
    getAnnouncements();
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#f44336';
      case 'medium': return '#ff9800';
      case 'low': return '#4caf50';
      default: return '#ff9800';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '🟡';
    }
  };

  const addAnnouncement = async () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.message.trim() || !announcementsCollectionRef || !currentUser) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    
    if (selectedTarget === 'section' && (!selectedClass || !selectedSection)) {
      Alert.alert('Error', 'Please select a class and section for section announcements');
      return;
    }

    try {
      const announcementData = {
        title: newAnnouncement.title.trim(),
        message: newAnnouncement.message.trim(),
        priority: newAnnouncement.priority,
        professor: currentUser?.displayName || currentUser?.email || 'Instructor',
        professorId: currentUser.uid,
        createdBy: currentUser.uid, // Add this required field
        timestamp: new Date().toISOString(),
        createdAt: new Date(),
        likes: 0,
        comments: 0,
        targetType: selectedTarget,
        ...(selectedTarget === 'section' && {
          targetClassId: selectedClass.id,
          targetClassName: selectedClass.name,
          targetSection: selectedSection
        })
      };

      await addDoc(announcementsCollectionRef, announcementData);
      
      // Reset form
      setNewAnnouncement({
        title: '',
        message: '',
        priority: 'medium',
        targetType: 'campus',
        targetClassId: null,
        targetClassName: '',
        targetSection: null
      });
      setSelectedTarget('campus');
      setSelectedClass(null);
      setSelectedSection(null);
      setShowCreateModal(false);
      
      const targetMessage = selectedTarget === 'campus' 
        ? 'Campus announcement posted successfully!'
        : `Section announcement posted to ${selectedClass?.name} - ${selectedSection}`;
      Alert.alert('Success', targetMessage);
    } catch (error) {
      console.error('Error adding announcement:', error);
      Alert.alert('Error', 'Failed to post announcement');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Announcements</Text>
          <Text style={styles.subtitle}>
            Campus & Section Updates • Real-time ({refreshCount})
            {lastRefreshTime && ` • Updated ${lastRefreshTime.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}`}
            {isAutoRefreshing && ' �'}
          </Text>
        </View>
        {userRole === 'instructor' && (
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#E75C1A']}
            tintColor="#E75C1A"
          />
        }
      >
        {announcements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📢</Text>
            <Text style={styles.emptyStateTitle}>No announcements yet</Text>
            <Text style={styles.emptyStateText}>
              {userRole === 'instructor' 
                ? 'Create your first announcement to get started!'
                : 'No announcements have been posted yet.'
              }
            </Text>
          </View>
        ) : (
          announcements.map((announcement) => (
            <View key={announcement.id} style={styles.announcementCard}>
              <View style={styles.announcementHeader}>
                <View style={styles.announcementTitleRow}>
                  <View style={styles.titleWithPriority}>
                    <Text style={styles.priorityIcon}>{getPriorityIcon(announcement.priority)}</Text>
                    <Text style={styles.announcementTitle}>
                      {announcement.title || 'Announcement'}
                    </Text>
                  </View>
                  <Text style={styles.timestamp}>
                    {new Date(announcement.timestamp).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </Text>
                </View>
                
                <View style={styles.announcementMetaRow}>
                  <Text style={styles.professorName}>By {announcement.professor}</Text>
                  <View style={styles.targetIndicator}>
                    {announcement.targetType === 'campus' ? (
                      <Text style={[styles.targetBadge, styles.campusBadge]}>🏫 Campus</Text>
                    ) : (
                      <Text style={[styles.targetBadge, styles.sectionBadge]}>
                        📚 {announcement.targetClassName} - {announcement.targetSection}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              
              <Text style={styles.announcementMessage}>
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
          ))
        )}
      </ScrollView>

      {/* Create Announcement Modal */}
      <Modal
        visible={showCreateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Announcement</Text>
              <TouchableOpacity onPress={() => {
                setShowCreateModal(false);
                setNewAnnouncement({
                  title: '',
                  message: '',
                  priority: 'medium',
                  targetType: 'campus',
                  targetClassId: null,
                  targetClassName: '',
                  targetSection: null
                });
                setSelectedTarget('campus');
                setSelectedClass(null);
                setSelectedSection(null);
              }}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Title */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Title *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Announcement title"
                  value={newAnnouncement.title}
                  onChangeText={(text) => setNewAnnouncement({...newAnnouncement, title: text})}
                />
              </View>

              {/* Message */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Message *</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Write your announcement..."
                  multiline
                  numberOfLines={4}
                  value={newAnnouncement.message}
                  onChangeText={(text) => setNewAnnouncement({...newAnnouncement, message: text})}
                />
              </View>

              {/* Priority and Target Row */}
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Priority</Text>
                  <View style={styles.priorityButtons}>
                    {['low', 'medium', 'high'].map((priority) => (
                      <TouchableOpacity
                        key={priority}
                        style={[
                          styles.priorityButton,
                          newAnnouncement.priority === priority && styles.priorityButtonActive
                        ]}
                        onPress={() => setNewAnnouncement({...newAnnouncement, priority})}
                      >
                        <Text style={styles.priorityButtonText}>
                          {getPriorityIcon(priority)} {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.inputLabel}>Target</Text>
                  <View style={styles.targetButtons}>
                    <TouchableOpacity
                      style={[
                        styles.targetButton,
                        selectedTarget === 'campus' && styles.targetButtonActive
                      ]}
                      onPress={() => setSelectedTarget('campus')}
                    >
                      <Text style={[
                        styles.targetButtonText,
                        selectedTarget === 'campus' && styles.targetButtonTextActive
                      ]}>
                        🏫 Campus
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.targetButton,
                        selectedTarget === 'section' && styles.targetButtonActive
                      ]}
                      onPress={() => {
                        setSelectedTarget('section');
                        // Automatically open the target selection modal when section is selected
                        if (userClasses.length > 0) {
                          // Small delay to show the button press feedback before opening modal
                          setTimeout(() => {
                            setShowTargetModal(true);
                          }, 100);
                        } else {
                          Alert.alert(
                            'No Classes Found',
                            'You need to create a class first before making section announcements.',
                            [{ text: 'OK' }]
                          );
                          setSelectedTarget('campus'); // Revert to campus if no classes
                        }
                      }}
                    >
                      <Text style={[
                        styles.targetButtonText,
                        selectedTarget === 'section' && styles.targetButtonTextActive
                      ]}>
                        📚 Section
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Section Selection */}
              {selectedTarget === 'section' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Select Class & Section *</Text>
                  <TouchableOpacity
                    style={styles.sectionSelector}
                    onPress={() => setShowTargetModal(true)}
                  >
                    <Text style={[
                      styles.sectionSelectorText,
                      (!selectedClass || !selectedSection) && styles.placeholderText
                    ]}>
                      {selectedClass && selectedSection 
                        ? `${selectedClass.name} - ${selectedSection}`
                        : 'Tap to select class and section'
                      }
                    </Text>
                    <Text style={styles.selectorArrow}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewAnnouncement({
                    title: '',
                    message: '',
                    priority: 'medium',
                    targetType: 'campus',
                    targetClassId: null,
                    targetClassName: '',
                    targetSection: null
                  });
                  setSelectedTarget('campus');
                  setSelectedClass(null);
                  setSelectedSection(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.createButton,
                  (!newAnnouncement.title.trim() || !newAnnouncement.message.trim() || 
                   (selectedTarget === 'section' && (!selectedClass || !selectedSection))) 
                    && styles.createButtonDisabled
                ]}
                onPress={addAnnouncement}
                disabled={!newAnnouncement.title.trim() || !newAnnouncement.message.trim() || 
                         (selectedTarget === 'section' && (!selectedClass || !selectedSection))}
              >
                <Text style={styles.createButtonText}>
                  {selectedTarget === 'campus' ? 'Post to Campus' : 'Post to Section'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Class & Section Selection Modal */}
      <Modal
        visible={showTargetModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTargetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Class & Section</Text>
              <TouchableOpacity onPress={() => setShowTargetModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {userClasses.map((classItem) => (
                <View key={classItem.id} style={styles.classItem}>
                  <Text style={styles.className}>{classItem.name}</Text>
                  <Text style={styles.classSubject}>{classItem.subject}</Text>
                  
                  <View style={styles.sectionButtons}>
                    {/* Show the actual section from the class */}
                    <TouchableOpacity
                      style={[
                        styles.sectionButton,
                        selectedClass?.id === classItem.id && selectedSection === classItem.section && styles.sectionButtonActive
                      ]}
                      onPress={() => {
                        setSelectedClass(classItem);
                        setSelectedSection(classItem.section);
                        setShowTargetModal(false);
                      }}
                    >
                      <Text style={[
                        styles.sectionButtonText,
                        selectedClass?.id === classItem.id && selectedSection === classItem.section && styles.sectionButtonTextActive
                      ]}>
                        {classItem.section}
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Add "All Sections" option for the class */}
                    <TouchableOpacity
                      style={[
                        styles.sectionButton,
                        selectedClass?.id === classItem.id && selectedSection === 'All Sections' && styles.sectionButtonActive
                      ]}
                      onPress={() => {
                        setSelectedClass(classItem);
                        setSelectedSection('All Sections');
                        setShowTargetModal(false);
                      }}
                    >
                      <Text style={[
                        styles.sectionButtonText,
                        selectedClass?.id === classItem.id && selectedSection === 'All Sections' && styles.sectionButtonTextActive
                      ]}>
                        All Sections
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
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
    marginBottom: 12,
  },
  announcementTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleWithPriority: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  priorityIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  announcementMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  announcementMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
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
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  targetSelectionContainer: {
    marginBottom: 16,
  },
  targetLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  targetButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  targetButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
  },
  targetButtonActive: {
    backgroundColor: '#E75C1A',
    borderColor: '#E75C1A',
  },
  targetButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  targetButtonTextActive: {
    color: '#fff',
  },
  sectionSelectionContainer: {
    marginBottom: 16,
  },
  sectionSelector: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f8f8f8',
  },
  sectionSelectorLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  sectionSelectorValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  input: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  postButton: {
    backgroundColor: '#E75C1A',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  postButtonDisabled: {
    backgroundColor: '#ccc',
  },
  postButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  targetIndicator: {
    marginTop: 4,
  },
  targetBadge: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  campusBadge: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
  },
  sectionBadge: {
    backgroundColor: '#f3e5f5',
    color: '#7b1fa2',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    fontSize: 20,
    color: '#666',
    padding: 4,
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
  },
  priorityButtonActive: {
    backgroundColor: '#E75C1A',
    borderColor: '#E75C1A',
  },
  priorityButtonText: {
    fontSize: 12,
    color: '#666',
  },
  sectionSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    backgroundColor: '#f8f8f8',
  },
  sectionSelectorText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  placeholderText: {
    color: '#999',
  },
  selectorArrow: {
    fontSize: 16,
    color: '#999',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f8f8',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  createButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    backgroundColor: '#E75C1A',
    flex: 1,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  classItem: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  classSubject: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  sectionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f8f8',
  },
  sectionButtonActive: {
    backgroundColor: '#E75C1A',
    borderColor: '#E75C1A',
  },
  sectionButtonText: {
    fontSize: 14,
    color: '#666',
  },
  sectionButtonTextActive: {
    color: '#fff',
  },
});
