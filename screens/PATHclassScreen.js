import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Modal, TextInput, Alert, Image } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, addDoc, getDocs, updateDoc, arrayUnion, arrayRemove, serverTimestamp, query, where, deleteDoc } from 'firebase/firestore';

export default function PATHclassScreen() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [classes, setClasses] = useState([]);
  const [showJoinClassModal, setShowJoinClassModal] = useState(false);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showUnenrollModal, setShowUnenrollModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classCode, setClassCode] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassSubject, setNewClassSubject] = useState('');
  const [newClassSection, setNewClassSection] = useState('');
  
  const navigation = useNavigation();

  // Fetch user role from Firestore
  const fetchUserRole = async (user) => {
    if (user && db) {
      try {
        console.log('Fetching user role for:', user.uid);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          console.log('User role found:', role);
          setUserRole(role);
        } else {
          console.log('No user document found, defaulting to student');
          // If no user document exists, default to student
          setUserRole('student');
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        // Default to student if there's an error
        setUserRole('student');
      }
    }
  };

  // Fetch classes from Firestore
  const fetchClasses = async () => {
    if (currentUser && db && userRole) {
      try {
        console.log(`Fetching classes for ${userRole}:`, currentUser.uid);
        const classesCollection = collection(db, 'classes');
        let classesSnapshot;
        
        if (userRole === 'instructor') {
          // For instructors, get classes they created
          const q = query(classesCollection, where('createdBy', '==', currentUser.uid));
          classesSnapshot = await getDocs(q);
          console.log('Instructor classes found:', classesSnapshot.docs.length);
        } else {
          // For students, get all classes where they are enrolled
          const q = query(classesCollection, where('students', 'array-contains', currentUser.uid));
          classesSnapshot = await getDocs(q);
          console.log('Student enrolled classes found:', classesSnapshot.docs.length);
        }
        
        const classesData = classesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('Classes data:', classesData);
        setClasses(classesData);
      } catch (error) {
        console.error('Error fetching classes:', error);
        // Don't clear classes on error, keep existing ones
        Alert.alert('Network Error', 'Unable to sync classes. Please check your internet connection.');
      }
    } else {
      console.log('Missing requirements for fetchClasses:', {
        currentUser: !!currentUser,
        db: !!db,
        userRole
      });
    }
  };

  // Create class function (for instructors)
  const createClass = async () => {
    if (!newClassName.trim() || !newClassSubject.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      if (db && currentUser) {
        console.log('Creating class with user:', currentUser.uid);
        
        // Generate a random class code
        const generateClassCode = () => {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let result = '';
          for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return result;
        };

        const classCode = generateClassCode();
        
        // Create class object for Firebase
        const newClassData = {
          name: newClassName.trim(),
          subject: newClassSubject.trim(),
          section: newClassSection.trim() || 'Section 1',
          teacher: currentUser?.displayName || currentUser?.email || 'You',
          code: classCode,
          color: getRandomColor(),
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          students: [], // Array to store student UIDs
          studentCount: 0
        };

        console.log('Attempting to create class with data:', newClassData);

        // Save to Firebase
        const docRef = await addDoc(collection(db, 'classes'), newClassData);
        
        console.log('Class created successfully with ID:', docRef.id);
        
        // Refresh classes list instead of manually adding to local state
        await fetchClasses();

        setShowCreateClassModal(false);
        setNewClassName('');
        setNewClassSubject('');
        setNewClassSection('');
        Alert.alert('Success', `Class created successfully!\nClass code: ${classCode}\n\nShare this code with your students so they can join your class.`);
      }
    } catch (error) {
      console.error('Error creating class:', error);
      console.error('Error details:', error.message);
      Alert.alert('Error', `Failed to create class: ${error.message}\n\nPlease check your internet connection and try again.`);
    }
  };

  // Join class function (for students)
  const joinClass = async () => {
    if (!classCode.trim()) {
      Alert.alert('Error', 'Please enter a class code');
      return;
    }

    try {
      if (db && currentUser) {
        console.log('Attempting to join class with code:', classCode.toUpperCase());
        
        // Search for class with the entered code
        const classesCollection = collection(db, 'classes');
        const q = query(classesCollection, where('code', '==', classCode.toUpperCase()));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          Alert.alert('Error', 'No class found with this code. Please check the code and try again.');
          return;
        }

        const classDoc = querySnapshot.docs[0];
        const classData = classDoc.data();

        console.log('Found class:', classData.name);

        // Check if student is already enrolled
        if (classData.students && classData.students.includes(currentUser.uid)) {
          Alert.alert('Already Enrolled', 'You are already enrolled in this class.');
          setShowJoinClassModal(false);
          setClassCode('');
          return;
        }

        console.log('Adding student to class...');

        // Add student to the class
        await updateDoc(doc(db, 'classes', classDoc.id), {
          students: arrayUnion(currentUser.uid),
          studentCount: (classData.studentCount || 0) + 1
        });

        console.log('Student added successfully');

        // Refresh classes list
        await fetchClasses();

        setShowJoinClassModal(false);
        setClassCode('');
        Alert.alert('Success', `Successfully joined "${classData.name}"!`);
      }
    } catch (error) {
      console.error('Error joining class:', error);
      Alert.alert('Error', `Failed to join class: ${error.message}`);
    }
  };

  // Unenroll from class function (or delete class for instructors)
  const unenrollFromClass = async () => {
    if (!selectedClass) return;

    try {
      if (db && currentUser) {
        if (userRole === 'instructor') {
          // For instructors: Delete the entire class and all related data
          console.log('Instructor deleting class:', selectedClass.id);
          
          // First, delete all assignments and their related submissions
          const assignmentsRef = collection(db, 'classes', selectedClass.id, 'assignments');
          const assignmentsSnapshot = await getDocs(assignmentsRef);
          
          for (const assignmentDoc of assignmentsSnapshot.docs) {
            console.log('Deleting assignment:', assignmentDoc.id);
            
            // Delete all submissions for this assignment
            const submissionsRef = collection(db, 'classes', selectedClass.id, 'submissions');
            const submissionsQuery = query(submissionsRef, where('assignmentId', '==', assignmentDoc.id));
            const submissionsSnapshot = await getDocs(submissionsQuery);
            
            for (const submissionDoc of submissionsSnapshot.docs) {
              console.log('Deleting submission:', submissionDoc.id);
              await deleteDoc(submissionDoc.ref);
            }
            
            // Delete the assignment document
            await deleteDoc(assignmentDoc.ref);
          }
          
          // Delete all remaining submissions (if any)
          const allSubmissionsRef = collection(db, 'classes', selectedClass.id, 'submissions');
          const allSubmissionsSnapshot = await getDocs(allSubmissionsRef);
          for (const submissionDoc of allSubmissionsSnapshot.docs) {
            console.log('Deleting remaining submission:', submissionDoc.id);
            await deleteDoc(submissionDoc.ref);
          }
          
          // Delete all students enrolled in the class
          const studentsRef = collection(db, 'classes', selectedClass.id, 'students');
          const studentsSnapshot = await getDocs(studentsRef);
          for (const studentDoc of studentsSnapshot.docs) {
            console.log('Deleting student enrollment:', studentDoc.id);
            await deleteDoc(studentDoc.ref);
          }
          
          // Delete all grades for this class
          const gradesRef = collection(db, 'classes', selectedClass.id, 'grades');
          const gradesSnapshot = await getDocs(gradesRef);
          for (const gradeDoc of gradesSnapshot.docs) {
            console.log('Deleting grade:', gradeDoc.id);
            await deleteDoc(gradeDoc.ref);
          }
          
          // Delete any announcements for this class
          const announcementsRef = collection(db, 'classes', selectedClass.id, 'announcements');
          const announcementsSnapshot = await getDocs(announcementsRef);
          for (const announcementDoc of announcementsSnapshot.docs) {
            console.log('Deleting announcement:', announcementDoc.id);
            await deleteDoc(announcementDoc.ref);
          }
          
          // Delete any class materials
          const materialsRef = collection(db, 'classes', selectedClass.id, 'materials');
          const materialsSnapshot = await getDocs(materialsRef);
          for (const materialDoc of materialsSnapshot.docs) {
            console.log('Deleting material:', materialDoc.id);
            await deleteDoc(materialDoc.ref);
          }
          
          // Finally, delete the class document itself
          await deleteDoc(doc(db, 'classes', selectedClass.id));
          
          console.log('Successfully deleted class and all related data');
        } else {
          // For students: Remove from the students array
          console.log('Student unenrolling from class:', selectedClass.id);
          console.log('Current user UID:', currentUser.uid);
          console.log('Current students array:', selectedClass.students);
          
          await updateDoc(doc(db, 'classes', selectedClass.id), {
            students: arrayRemove(currentUser.uid),
            studentCount: Math.max((selectedClass.studentCount || 1) - 1, 0)
          });
          
          console.log('Successfully removed student from class');
        }

        // Refresh classes list
        await fetchClasses();

        setShowUnenrollModal(false);
        setSelectedClass(null);
        const message = userRole === 'instructor' 
          ? 'Class and all related data deleted successfully!' 
          : 'Successfully unenrolled from the class!';
        Alert.alert('Success', message);
      }
    } catch (error) {
      console.error('Error processing request:', error);
      const errorMessage = userRole === 'instructor'
        ? 'Failed to delete class. Please try again.'
        : 'Failed to unenroll from class. Please try again.';
      Alert.alert('Error', `${errorMessage}\n\nError: ${error.message}`);
    }
  };

  // Handle class menu button press
  const handleClassMenu = (classItem) => {
    setSelectedClass(classItem);
    if (userRole === 'instructor') {
      // For instructors, show class management options
      Alert.alert(
        'Manage Class',
        `What would you like to do with "${classItem.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Class Code', onPress: () => showClassCode(classItem) },
          { text: 'Delete Class', style: 'destructive', onPress: () => setShowUnenrollModal(true) }
        ]
      );
    } else {
      // For students, show unenroll option
      setShowUnenrollModal(true);
    }
  };

  // Show class code function
  const showClassCode = (classItem) => {
    Alert.alert(
      'Class Code',
      `Share this code with your students:\n\n${classItem.code}`,
      [{ text: 'OK' }]
    );
  };

  // Pull to refresh function
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const user = auth.currentUser;
      if (user) {
        console.log('Refreshing data for user:', user.uid);
        await fetchUserRole(user);
        // fetchClasses will be called automatically by the useEffect when userRole updates
      }
    } catch (error) {
      console.error('Error refreshing:', error);
      Alert.alert('Refresh Error', 'Unable to refresh data. Please try again.');
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
      } else {
        // Clear data when user logs out
        setUserRole(null);
        setClasses([]);
      }
    });
    
    return unsubscribe;
  }, []);

  // Separate effect to fetch classes when both user and role are available
  useEffect(() => {
    if (currentUser && userRole) {
      fetchClasses();
    }
  }, [currentUser, userRole]);

  // Refresh classes when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (currentUser && userRole) {
        fetchClasses();
      }
    }, [currentUser, userRole])
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PathFit Class</Text>
        <View style={styles.headerRight}>
          {userRole && (
            <View style={[
              styles.roleBadge,
              userRole === 'instructor' ? styles.instructorBadge : styles.studentBadge
            ]}>
              <Text style={[
                styles.roleText,
                userRole === 'instructor' ? styles.instructorText : styles.studentText
              ]}>
                {userRole}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Debug Info - Remove this in production */}
      {/* {__DEV__ && (
        <View style={{ padding: 10, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 12 }}>
            Debug: User: {currentUser?.email || 'None'} | Role: {userRole || 'None'} | Classes: {classes.length}
          </Text>
        </View>
      )} */}

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
                {userRole === 'instructor' 
                  ? 'Create your first class to get started'
                  : 'Join your first class to get started'
                }
              </Text>
            </View>
          ) : (
            <View style={styles.classesGrid}>
              {classes.map((classItem) => (
                <TouchableOpacity 
                  key={classItem.id} 
                  style={styles.classCard}
                  onPress={() => navigation.navigate('ClassDetails', { 
                    classInfo: classItem,
                    userRole: userRole 
                  })}
                >
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
                      {userRole === 'instructor' && (
                        <Text style={styles.classStudentCount}>
                          {classItem.studentCount || 0} students
                        </Text>
                      )}
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
        onPress={() => {
          if (userRole === 'instructor') {
            setShowCreateClassModal(true);
          } else {
            setShowJoinClassModal(true);
          }
        }}
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
                  onChangeText={(text) => setClassCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  placeholderTextColor="#999"
                  maxLength={6}
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

      {/* Create Class Modal (for instructors) */}
      <Modal
        visible={showCreateClassModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateClassModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Class</Text>
              <TouchableOpacity onPress={() => setShowCreateClassModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                Create a new class for your students.
              </Text>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Class name (required)</Text>
                <TextInput
                  style={styles.classCodeInput}
                  placeholder="Enter class name"
                  value={newClassName}
                  onChangeText={setNewClassName}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Subject (required)</Text>
                <TextInput
                  style={styles.classCodeInput}
                  placeholder="Enter subject"
                  value={newClassSubject}
                  onChangeText={setNewClassSubject}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Section (optional)</Text>
                <TextInput
                  style={styles.classCodeInput}
                  placeholder="Enter section"
                  value={newClassSection}
                  onChangeText={setNewClassSection}
                  placeholderTextColor="#999"
                />
              </View>
              
              <Text style={styles.helpText}>
                Class details
              </Text>
              <Text style={styles.helpSubText}>
                • A unique class code will be generated automatically
                • Share the class code with your students so they can join
                • You can manage class settings after creation
              </Text>
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowCreateClassModal(false);
                  setNewClassName('');
                  setNewClassSubject('');
                  setNewClassSection('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.joinButton,
                  (newClassName.trim() && newClassSubject.trim()) ? styles.joinButtonActive : null
                ]}
                onPress={createClass}
                disabled={!(newClassName.trim() && newClassSubject.trim())}
              >
                <Text style={[
                  styles.joinButtonText,
                  (newClassName.trim() && newClassSubject.trim()) ? styles.joinButtonTextActive : null
                ]}>
                  Create
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
              <Text style={styles.modalTitle}>
                {userRole === 'instructor' ? 'Delete class?' : 'Unenroll from class?'}
              </Text>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.unenrollDescription}>
                {userRole === 'instructor' 
                  ? `This will permanently delete "${selectedClass?.name}" and ALL related data including:\n\n• All assignments and submissions\n• Student grades and feedback\n• Class announcements\n• Student enrollments\n• Class materials\n\nThis action cannot be undone and all data will be lost forever.`
                  : `You'll no longer have access to class materials and assignments from "${selectedClass?.name}".`
                }
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
                  {userRole === 'instructor' ? 'Delete' : 'Unenroll'}
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
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#E75C1A',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  backButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    width: 30,
    height: 22,
    textAlign: 'center',
    color: '#fff',
    marginTop: -10,
  },
  title: {
    fontSize: 26,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: 1,
    marginTop: 6,	
    marginLeft: 15,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  instructorBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  studentBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  roleText: {
    fontSize: 14,
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
    backgroundColor: '#ffeee0',
  },
  classesContainer: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 200,
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
  classStudentCount: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
    fontStyle: 'italic',
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
    bottom: 40,
    right: 40,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabIcon: {
    fontSize: 28,
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