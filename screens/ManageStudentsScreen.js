import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  TextInput, 
  Modal,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  arrayRemove, 
  arrayUnion, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// Import Firebase with error handling
let db = null;
let auth = null;
try {
  const firebase = require('../firebase');
  db = firebase.db;
  auth = firebase.auth;
} catch (error) {
  console.log('Firebase not available:', error);
}

export default function ManageStudentsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { classInfo, userRole: passedUserRole } = route.params || {};
  
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(passedUserRole || null);
  const [classDetails, setClassDetails] = useState(classInfo || null);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

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

  // Fetch latest class details and students
  const fetchClassData = async (showLoadingSpinner = true) => {
    if (!classInfo?.id || !db) return;
    
    if (showLoadingSpinner) {
      setIsLoading(true);
    }
    
    try {
      // Fetch class details
      const classDoc = await getDoc(doc(db, 'classes', classInfo.id));
      if (classDoc.exists()) {
        const classData = { ...classDoc.data(), id: classDoc.id };
        setClassDetails(classData);
        
        // Fetch student details
        if (classData.students && classData.students.length > 0) {
          const studentPromises = classData.students.map(async (studentId) => {
            try {
              const studentDoc = await getDoc(doc(db, 'users', studentId));
              if (studentDoc.exists()) {
                return {
                  id: studentId,
                  ...studentDoc.data()
                };
              }
              return null;
            } catch (error) {
              console.error('Error fetching student:', studentId, error);
              return null;
            }
          });
          
          const studentData = await Promise.all(studentPromises);
          const validStudents = studentData.filter(student => student !== null);
          setStudents(validStudents);
        } else {
          setStudents([]);
        }
      }
    } catch (error) {
      console.error('Error fetching class data:', error);
      Alert.alert('Error', 'Failed to load class data');
    } finally {
      if (showLoadingSpinner) {
        setIsLoading(false);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchClassData(false);
    setRefreshing(false);
  };

  // Add student by email
  const addStudentByEmail = async () => {
    if (!newStudentEmail.trim()) {
      Alert.alert('Error', 'Please enter a student email');
      return;
    }

    if (!db || !classDetails) {
      Alert.alert('Error', 'Unable to add student');
      return;
    }

    setAddingStudent(true);
    try {
      // Find user by email
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', newStudentEmail.trim().toLowerCase())
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      
      if (usersSnapshot.empty) {
        Alert.alert('Error', 'No user found with this email address');
        return;
      }

      const userData = usersSnapshot.docs[0];
      const studentId = userData.id;
      const studentData = userData.data();

      // Check if user is a student
      if (studentData.role !== 'student') {
        Alert.alert('Error', 'This user is not a student');
        return;
      }

      // Check if student is already in the class
      if (classDetails.students && classDetails.students.includes(studentId)) {
        Alert.alert('Error', 'This student is already enrolled in the class');
        return;
      }

      // Add student to class
      const classRef = doc(db, 'classes', classDetails.id);
      await updateDoc(classRef, {
        students: arrayUnion(studentId),
        studentCount: (classDetails.studentCount || 0) + 1
      });

      setNewStudentEmail('');
      setShowAddModal(false);
      Alert.alert('Success', `${studentData.displayName || studentData.email} has been added to the class`);
      
      // Refresh data
      await fetchClassData(false);
    } catch (error) {
      console.error('Error adding student:', error);
      Alert.alert('Error', 'Failed to add student. Please try again.');
    } finally {
      setAddingStudent(false);
    }
  };

  // Remove student from class
  const removeStudent = async (student) => {
    Alert.alert(
      'Remove Student',
      `Are you sure you want to remove ${student.displayName || student.email} from this class?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const classRef = doc(db, 'classes', classDetails.id);
              await updateDoc(classRef, {
                students: arrayRemove(student.id),
                studentCount: Math.max(0, (classDetails.studentCount || 1) - 1)
              });

              Alert.alert('Success', 'Student removed from class');
              await fetchClassData(false);
            } catch (error) {
              console.error('Error removing student:', error);
              Alert.alert('Error', 'Failed to remove student');
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        if (user) {
          fetchUserRole(user);
        } else {
          setUserRole(null);
        }
      });
      
      return unsubscribe;
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchClassData();
    }, [])
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Manage Students</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E75C1A" />
          <Text style={styles.loadingText}>Loading students...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Manage Students</Text>
        {userRole === 'instructor' && (
          <TouchableOpacity 
            onPress={() => setShowAddModal(true)} 
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Class Info Header */}
      <View style={styles.classHeader}>
        <Text style={styles.className}>{classDetails?.name}</Text>
        <Text style={styles.classInfo}>
          {classDetails?.section} • {students.length} student{students.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#E75C1A']}
            tintColor="#E75C1A"
          />
        }
      >
        {students.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>👥</Text>
            <Text style={styles.emptyStateTitle}>No students enrolled</Text>
            <Text style={styles.emptyStateSubtitle}>
              {userRole === 'instructor' 
                ? 'Add students to get started!' 
                : 'Students will appear here once they join.'
              }
            </Text>
          </View>
        ) : (
          <View style={styles.studentsList}>
            {students.map((student, index) => (
              <View key={student.id} style={styles.studentCard}>
                <View style={styles.studentAvatar}>
                  <Text style={styles.studentAvatarText}>
                    {(student.displayName || student.email || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>
                    {student.displayName || student.email?.split('@')[0] || 'Unknown Student'}
                  </Text>
                  <Text style={styles.studentEmail}>{student.email}</Text>
                  {student.studentId && (
                    <Text style={styles.studentId}>ID: {student.studentId}</Text>
                  )}
                </View>

                {userRole === 'instructor' && (
                  <TouchableOpacity 
                    onPress={() => removeStudent(student)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Student Modal */}
      <Modal visible={showAddModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Student</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Student Email</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter student's email address"
                value={newStudentEmail}
                onChangeText={setNewStudentEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              
              <Text style={styles.helpText}>
                The student must have an account with this email address.
              </Text>
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddModal(false);
                  setNewStudentEmail('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.addStudentButton, addingStudent && styles.addStudentButtonDisabled]}
                onPress={addStudentByEmail}
                disabled={addingStudent}
              >
                <Text style={styles.addStudentButtonText}>
                  {addingStudent ? 'Adding...' : 'Add Student'}
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  classHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  className: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  classInfo: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
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
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  studentsList: {
    paddingVertical: 16,
  },
  studentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  studentAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  studentEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  studentId: {
    fontSize: 12,
    color: '#999',
  },
  removeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ff5252',
    borderRadius: 6,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 18,
    color: '#666',
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  addStudentButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#E75C1A',
    alignItems: 'center',
  },
  addStudentButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  addStudentButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});