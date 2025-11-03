import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
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

export default function ClassDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { classInfo, userRole: passedUserRole } = route.params || {};
  
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(passedUserRole || null);
  const [classDetails, setClassDetails] = useState(classInfo || null);
  const [isLoading, setIsLoading] = useState(false);

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

  // Fetch latest class details
  const fetchClassDetails = async () => {
    if (!classInfo?.id || !db) return;
    
    try {
      const classDoc = await getDoc(doc(db, 'classes', classInfo.id));
      if (classDoc.exists()) {
        setClassDetails({ ...classDoc.data(), id: classDoc.id });
      }
    } catch (error) {
      console.error('Error fetching class details:', error);
    }
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

  useEffect(() => {
    fetchClassDetails();
  }, []);

  const handleUnenrollFromClass = async () => {
    if (!currentUser || !classDetails || !db) {
      Alert.alert('Error', 'Unable to unenroll from class');
      return;
    }

    Alert.alert(
      'Unenroll from Class',
      `Are you sure you want to leave "${classDetails.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const classRef = doc(db, 'classes', classDetails.id);
              await updateDoc(classRef, {
                students: arrayRemove(currentUser.uid),
                studentCount: Math.max(0, (classDetails.studentCount || 1) - 1)
              });
              
              Alert.alert('Success', 'You have left the class', [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
            } catch (error) {
              console.error('Error leaving class:', error);
              Alert.alert('Error', 'Failed to leave class. Please try again.');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  if (!classDetails) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Class Details</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading class details...</Text>
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
        <Text style={styles.title}>Class Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Class Info Card */}
        <View style={[styles.classCard, { backgroundColor: classDetails.color || '#1976D2' }]}>
          <View style={styles.classCardContent}>
            <Text style={styles.className}>{classDetails.name}</Text>
            <Text style={styles.classSection}>{classDetails.section}</Text>
            <Text style={styles.classTeacher}>👨‍🏫 {classDetails.teacher}</Text>
            <View style={styles.classStatsRow}>
              <Text style={styles.classStat}>📚 Code: {classDetails.code}</Text>
              <Text style={styles.classStat}>👥 {classDetails.studentCount || 0} students</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          {userRole === 'instructor' && (
            <>
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('Assignments', {
                  classInfo: classDetails,
                  userRole: userRole
                })}
              >
                <View style={styles.actionIcon}>
                  <Text style={styles.actionIconText}>📋</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Assignments</Text>
                  <Text style={styles.actionSubtitle}>Create and manage assignments</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('Grades', {
                  classInfo: classDetails,
                  userRole: userRole
                })}
              >
                <View style={styles.actionIcon}>
                  <Text style={styles.actionIconText}>📊</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Gradebook</Text>
                  <Text style={styles.actionSubtitle}>View and manage student grades</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('ManageStudents', {
                  classInfo: classDetails,
                  userRole: userRole
                })}
              >
                <View style={styles.actionIcon}>
                  <Text style={styles.actionIconText}>👥</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Manage Students</Text>
                  <Text style={styles.actionSubtitle}>View enrolled students and class roster</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>
            </>
          )}

          {userRole === 'student' && (
            <>
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('Assignments', {
                  classInfo: classDetails,
                  userRole: userRole
                })}
              >
                <View style={styles.actionIcon}>
                  <Text style={styles.actionIconText}>📝</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Assignments</Text>
                  <Text style={styles.actionSubtitle}>View and submit assignments</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => navigation.navigate('Grades', {
                  classInfo: classDetails,
                  userRole: userRole
                })}
              >
                <View style={styles.actionIcon}>
                  <Text style={styles.actionIconText}>📈</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Grades</Text>
                  <Text style={styles.actionSubtitle}>View your grades and feedback</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Student Actions */}
        {userRole === 'student' && (
          <View style={styles.dangerSection}>
            <TouchableOpacity 
              style={[styles.dangerButton, isLoading && styles.dangerButtonDisabled]} 
              onPress={handleUnenrollFromClass}
              disabled={isLoading}
            >
              <Text style={styles.dangerButtonText}>
                {isLoading ? 'Leaving...' : 'Leave Class'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  classCard: {
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
    marginBottom: 24,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  classCardContent: {
    alignItems: 'center',
  },
  className: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  classSection: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 12,
  },
  classTeacher: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 16,
  },
  classStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  classStat: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  actionsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  actionCard: {
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
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f2f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionIconText: {
    fontSize: 20,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  actionArrow: {
    fontSize: 20,
    color: '#ccc',
    marginLeft: 8,
  },
  dangerSection: {
    marginBottom: 32,
    paddingBottom: 20,
  },
  dangerButton: {
    backgroundColor: '#f44336',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dangerButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});