import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Modal, TextInput, Alert, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, addDoc, getDocs, serverTimestamp, query, where } from 'firebase/firestore';

export default function PATHclassScreen() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [classes, setClasses] = useState([]);
  const [showJoinClassModal, setShowJoinClassModal] = useState(false);
  const [showUnenrollModal, setShowUnenrollModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classCode, setClassCode] = useState('');
  
  const navigation = useNavigation();

  // Fetch user role from Firestore
  const fetchUserRole = async (user) => {
    if (user && db) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    }
  };

  // Fetch classes from Firestore
  const fetchClasses = async () => {
    if (currentUser && db) {
      try {
        const classesCollection = collection(db, 'classes');
        const classesSnapshot = await getDocs(classesCollection);
        const classesData = classesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClasses(classesData);
      } catch (error) {
        console.error('Error fetching classes:', error);
      }
    }
  };

  // Join class function
  const joinClass = async () => {
    if (!classCode.trim()) {
      Alert.alert('Error', 'Please enter a class code');
      return;
    }

    try {
      if (db) {
        // In a real implementation, you would search for the class by code
        // For now, we'll simulate joining a class
        const newClass = {
          id: Date.now().toString(),
          name: 'New Class',
          subject: 'Subject Name',
          teacher: 'Teacher Name',
          section: 'Section',
          code: classCode,
          color: '#E75C1A',
          joinedAt: serverTimestamp()
        };

        setClasses(prev => [...prev, newClass]);
        setShowJoinClassModal(false);
        setClassCode('');
        Alert.alert('Success', 'Successfully joined the class!');
      }
    } catch (error) {
      console.error('Error joining class:', error);
      Alert.alert('Error', 'Failed to join class. Please try again.');
    }
  };

  // Unenroll from class function
  const unenrollFromClass = async () => {
    if (!selectedClass) return;

    try {
      if (db) {
        // In a real implementation, you would remove the user from the class in Firebase
        // For now, we'll just remove from local state
        setClasses(prev => prev.filter(cls => cls.id !== selectedClass.id));
        setShowUnenrollModal(false);
        setSelectedClass(null);
        Alert.alert('Success', 'Successfully unenrolled from the class!');
      }
    } catch (error) {
      console.error('Error unenrolling from class:', error);
      Alert.alert('Error', 'Failed to unenroll from class. Please try again.');
    }
  };

  // Handle class menu button press
  const handleClassMenu = (classItem) => {
    setSelectedClass(classItem);
    setShowUnenrollModal(true);
  };

  // Pull to refresh function
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await fetchUserRole(user);
        await fetchClasses();
      }
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Generate random color for class cards
  const getRandomColor = () => {
    const colors = ['#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#D32F2F', '#00796B', '#5D4037', '#455A64'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        fetchUserRole(user);
        fetchClasses();
      } else {
        setUserRole(null);
        setClasses([]);
      }
    });
    
    return unsubscribe;
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PATHclass</Text>
        <View style={styles.headerRight}>
        </View>
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
        {/* Classes Grid */}
        <View style={styles.classesContainer}>
          {classes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📚</Text>
              <Text style={styles.emptyStateTitle}>No classes yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                Join your first class to get started
              </Text>
            </View>
          ) : (
            <View style={styles.classesGrid}>
              {classes.map((classItem) => (
                <TouchableOpacity key={classItem.id} style={styles.classCard}>
                  <View style={[styles.classHeader, { backgroundColor: classItem.color || '#1976D2' }]}>
                    <View style={styles.classHeaderContent}>
                      <Text style={styles.className} numberOfLines={2}>
                        {classItem.name}
                      </Text>
                      <Text style={styles.classSection}>
                        {classItem.section}
                      </Text>
                      <Text style={styles.classTeacher}>
                        {classItem.teacher}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.classMenuButton}
                      onPress={() => handleClassMenu(classItem)}
                    >
                      <Text style={styles.classMenuIcon}>⋯</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.classFooter}>
                    <View style={styles.classIcons}>
                      <TouchableOpacity style={styles.classIconButton}>
                        <Text style={styles.classIcon}>👥</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.classIconButton}>
                        <Text style={styles.classIcon}>📁</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => setShowJoinClassModal(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Join Class Modal */}
      <Modal
        visible={showJoinClassModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowJoinClassModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join Class</Text>
              <TouchableOpacity onPress={() => setShowJoinClassModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                Ask your teacher for the class code, then enter it here.
              </Text>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Class code</Text>
                <TextInput
                  style={styles.classCodeInput}
                  placeholder="Enter class code"
                  value={classCode}
                  onChangeText={setClassCode}
                  autoCapitalize="characters"
                  placeholderTextColor="#999"
                />
              </View>
              
              <Text style={styles.helpText}>
                To sign in with a class code
              </Text>
              <Text style={styles.helpSubText}>
                • Use an authorized account
                • Use a class code with 5-7 letters or numbers, with no spaces or symbols
              </Text>
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowJoinClassModal(false);
                  setClassCode('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.joinButton,
                  classCode.trim() ? styles.joinButtonActive : null
                ]}
                onPress={joinClass}
                disabled={!classCode.trim()}
              >
                <Text style={[
                  styles.joinButtonText,
                  classCode.trim() ? styles.joinButtonTextActive : null
                ]}>
                  Join
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unenroll Confirmation Modal */}
      <Modal
        visible={showUnenrollModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUnenrollModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.unenrollModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Unenroll from class?</Text>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.unenrollDescription}>
                You'll no longer have access to class materials and assignments from{' '}
                <Text style={styles.unenrollClassName}>
                  {selectedClass?.name}
                </Text>
              </Text>
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowUnenrollModal(false);
                  setSelectedClass(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.unenrollButton}
                onPress={unenrollFromClass}
              >
                <Text style={styles.unenrollButtonText}>
                  Unenroll
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
    backgroundColor: '#1976D2',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: {
    fontSize: 20,
    color: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  instructorBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  studentBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  instructorText: {
    color: '#fff',
  },
  studentText: {
    color: '#fff',
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  classesContainer: {
    flex: 1,
    padding: 16,
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
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  classesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  classCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    overflow: 'hidden',
  },
  classHeader: {
    height: 120,
    padding: 16,
    position: 'relative',
  },
  classHeaderContent: {
    flex: 1,
  },
  className: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    lineHeight: 22,
  },
  classSection: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  classTeacher: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  classMenuButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 8,
  },
  classMenuIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  classFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  classIcons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  classIconButton: {
    padding: 8,
  },
  classIcon: {
    fontSize: 20,
    color: '#666',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabIcon: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
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
    borderRadius: 8,
    width: '100%',
    maxWidth: 400,
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
    fontSize: 20,
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
  },
  modalDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  classCodeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  helpText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 8,
  },
  helpSubText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  joinButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  joinButtonActive: {
    backgroundColor: '#1976D2',
  },
  joinButtonText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  joinButtonTextActive: {
    color: '#fff',
  },
  unenrollModalContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    width: '100%',
    maxWidth: 350,
  },
  unenrollDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
  },
  unenrollClassName: {
    fontWeight: '600',
    color: '#333',
  },
  unenrollButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#d32f2f',
  },
  unenrollButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});