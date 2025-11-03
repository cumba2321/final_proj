import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Modal, Image } from 'react-native';
import { auth, db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function PeopleScreen() {
  const [activeTab, setActiveTab] = useState('World');
  const [worldUsers, setWorldUsers] = useState([]);
  const [classmates, setClassmates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('PeopleScreen: Auth state changed', user ? 'User logged in' : 'User logged out');
      setCurrentUser(user);
      setAuthInitialized(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    console.log('PeopleScreen: Effect triggered', { authInitialized, currentUser: !!currentUser, activeTab });
    
    if (!authInitialized) return;
    
    if (!currentUser) {
      console.log('PeopleScreen: No current user');
      Alert.alert('Error', 'Please log in to view people');
      return;
    }
    
    if (activeTab === 'World') {
      console.log('PeopleScreen: Fetching world users');
      fetchWorldUsers();
    } else {
      console.log('PeopleScreen: Fetching classmates');
      fetchClassmates();
    }
  }, [activeTab, currentUser, authInitialized]);

  const fetchWorldUsers = async () => {
    if (!currentUser) return;
    
    try {
      console.log('PeopleScreen: Starting to fetch world users');
      setLoading(true);
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const users = [];
      
      snapshot.forEach((doc) => {
        const userData = doc.data();
        if (doc.id !== currentUser?.uid) { // Exclude current user
          users.push({
            id: doc.id,
            name: userData.name || userData.displayName || 'Unknown User',
            email: userData.email || 'No email',
            role: userData.role || 'student',
            course: userData.course || 'No course specified',
            avatar: userData.photoURL || userData.avatar || null
          });
        }
      });
      
      console.log('PeopleScreen: Fetched world users:', users.length);
      setWorldUsers(users);
    } catch (error) {
      console.error('Error fetching world users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchClassmates = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      const classmatesSet = new Set();
      
      // Get all classes where current user is enrolled (as student) or created (as instructor)
      const classesRef = collection(db, 'classes');
      
      // Check classes where user is a student
      const studentQuery = query(classesRef, where('students', 'array-contains', currentUser?.uid));
      const studentSnapshot = await getDocs(studentQuery);
      
      // Check classes where user is the instructor
      const instructorQuery = query(classesRef, where('createdBy', '==', currentUser?.uid));
      const instructorSnapshot = await getDocs(instructorQuery);
      
      // Collect all student IDs from these classes
      const allClassData = [...studentSnapshot.docs, ...instructorSnapshot.docs];
      
      allClassData.forEach((doc) => {
        const classData = doc.data();
        if (classData.students && Array.isArray(classData.students)) {
          classData.students.forEach(studentId => {
            if (studentId !== currentUser?.uid) {
              classmatesSet.add(studentId);
            }
          });
        }
        // Also add the instructor if current user is not the instructor
        if (classData.createdBy && classData.createdBy !== currentUser?.uid) {
          classmatesSet.add(classData.createdBy);
        }
      });
      
      // Fetch user details for all classmates
      const classmatesList = [];
      if (classmatesSet.size > 0) {
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        usersSnapshot.forEach((doc) => {
          if (classmatesSet.has(doc.id)) {
            const userData = doc.data();
            classmatesList.push({
              id: doc.id,
              name: userData.name || userData.displayName || 'Unknown User',
              email: userData.email || 'No email',
              role: userData.role || 'student',
              course: userData.course || 'No course specified',
              avatar: userData.photoURL || userData.avatar || null
            });
          }
        });
      }
      
      setClassmates(classmatesList);
    } catch (error) {
      console.error('Error fetching classmates:', error);
      Alert.alert('Error', 'Failed to load classmates');
    } finally {
      setLoading(false);
    }
  };

  const handleViewProfile = async (user) => {
    try {
      setProfileLoading(true);
      setShowProfile(true);
      
      // Fetch detailed user information
      const userDocRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Handle different date formats (ISO string vs Firestore timestamp)
        let joinedDate = 'Unknown';
        if (userData.createdAt) {
          if (typeof userData.createdAt === 'string') {
            // ISO string format
            joinedDate = new Date(userData.createdAt).toLocaleDateString();
          } else if (userData.createdAt.seconds) {
            // Firestore timestamp format
            joinedDate = new Date(userData.createdAt.seconds * 1000).toLocaleDateString();
          }
        }
        
        setSelectedUser({
          ...user,
          course: userData.course || 'No course specified',
          bio: userData.bio || 'No bio available',
          joinedDate: joinedDate,
          phone: userData.phone || 'No phone number',
          avatar: userData.photoURL || userData.avatar || user.avatar || null
        });
      } else {
        setSelectedUser({
          ...user,
          course: 'No course specified',
          bio: 'No bio available',
          joinedDate: 'Unknown',
          phone: 'No phone number',
          avatar: user.avatar || null
        });
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      Alert.alert('Error', 'Failed to load user profile');
      setShowProfile(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const renderUserItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.userCard} 
      onPress={() => handleViewProfile(item)}
      activeOpacity={0.7}
    >
      <View style={styles.userCardContent}>
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Image 
              source={{ uri: item.avatar }} 
              style={styles.userAvatar}
              onError={() => {
                // Handle image load error by showing default avatar
                console.log('Failed to load avatar for user:', item.name);
              }}
            />
          ) : (
            <View style={styles.defaultAvatar}>
              <Text style={styles.avatarInitial}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          <Text style={styles.userRole}>{item.role}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const currentData = activeTab === 'World' ? worldUsers : classmates;

  // Show loading while authentication is initializing
  if (!authInitialized) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>People</Text>
        <View style={styles.contentContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  // Show error if not authenticated
  if (!currentUser) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>People</Text>
        <View style={styles.contentContainer}>
          <Text style={styles.emptyText}>Please log in to view people</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>People</Text>
      
      {/* Tab Buttons */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'World' && styles.activeTab]}
          onPress={() => setActiveTab('World')}
        >
          <Text style={[styles.tabText, activeTab === 'World' && styles.activeTabText]}>
            World
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'Classmates' && styles.activeTab]}
          onPress={() => setActiveTab('Classmates')}
        >
          <Text style={[styles.tabText, activeTab === 'Classmates' && styles.activeTabText]}>
            Classmates
          </Text>
        </TouchableOpacity>
      </View>

      {/* Users List */}
      <View style={styles.contentContainer}>
        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : currentData.length === 0 ? (
          <Text style={styles.emptyText}>
            {activeTab === 'World' ? 'No users found' : 'No classmates found'}
          </Text>
        ) : (
          <FlatList
            data={currentData}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            style={styles.usersList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Profile Modal */}
      <Modal
        visible={showProfile}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProfile(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User Profile</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowProfile(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {profileLoading ? (
              <Text style={styles.loadingText}>Loading profile...</Text>
            ) : selectedUser ? (
              <View style={styles.profileContent}>
                <View style={styles.profileHeader}>
                  <View style={styles.profileAvatarContainer}>
                    {selectedUser.avatar ? (
                      <Image 
                        source={{ uri: selectedUser.avatar }} 
                        style={styles.profileAvatar}
                        onError={() => {
                          console.log('Failed to load profile avatar for user:', selectedUser.name);
                        }}
                      />
                    ) : (
                      <View style={styles.defaultProfileAvatar}>
                        <Text style={styles.profileAvatarInitial}>
                          {selectedUser.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.profileName}>{selectedUser.name}</Text>
                  <Text style={styles.profileRole}>{selectedUser.role}</Text>
                </View>

                <View style={styles.profileDetails}>
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Email:</Text>
                    <Text style={styles.profileValue}>{selectedUser.email}</Text>
                  </View>
                  
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Course:</Text>
                    <Text style={styles.profileValue}>{selectedUser.course}</Text>
                  </View>
                  
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Joined:</Text>
                    <Text style={styles.profileValue}>{selectedUser.joinedDate}</Text>
                  </View>
                  
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Phone:</Text>
                    <Text style={styles.profileValue}>{selectedUser.phone}</Text>
                  </View>

                  <View style={styles.bioSection}>
                    <Text style={styles.profileLabel}>Bio:</Text>
                    <Text style={styles.bioText}>{selectedUser.bio}</Text>
                  </View>
                </View>
              </View>
            ) : null}
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
    paddingTop: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E75C1A',
    textAlign: 'center',
    marginBottom: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#E75C1A',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#666',
  },
  usersList: {
    flex: 1,
  },
  userCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#E75C1A',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  userInfo: {
    flex: 1,
  },
  userCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 12,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f0f0',
  },
  defaultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  userRole: {
    fontSize: 12,
    color: '#E75C1A',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 12,
    maxHeight: '80%',
    width: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
  },
  profileContent: {
    padding: 20,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  profileAvatarContainer: {
    marginBottom: 16,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    borderWidth: 3,
    borderColor: '#E75C1A',
  },
  defaultProfileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E75C1A',
  },
  profileAvatarInitial: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profileRole: {
    fontSize: 16,
    color: '#E75C1A',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  profileDetails: {
    marginTop: 10,
  },
  profileRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  profileLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    width: 80,
  },
  profileValue: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  bioSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  bioText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    marginTop: 8,
  },
});
