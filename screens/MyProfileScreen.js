import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function MyProfileScreen() {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUserData = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        // Force reload the user to get latest data
        await currentUser.reload();
        
        // Fetch additional user data from Firestore
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        let userData = {
          name: currentUser.displayName || 'User',
          email: currentUser.email || 'No email',
          course: 'No course specified',
          phone: 'No phone number',
          bio: 'No bio available',
          joinedDate: 'Unknown',
          avatar: currentUser.photoURL,
          uid: currentUser.uid
        };
        
        if (userDoc.exists()) {
          const firestoreData = userDoc.data();
          
          // Handle different date formats (ISO string vs Firestore timestamp)
          let joinedDate = 'Unknown';
          if (firestoreData.createdAt) {
            if (typeof firestoreData.createdAt === 'string') {
              // ISO string format
              joinedDate = new Date(firestoreData.createdAt).toLocaleDateString();
            } else if (firestoreData.createdAt.seconds) {
              // Firestore timestamp format
              joinedDate = new Date(firestoreData.createdAt.seconds * 1000).toLocaleDateString();
            }
          }
          
          userData = {
            ...userData,
            course: firestoreData.course || 'No course specified',
            phone: firestoreData.phone || 'No phone number',
            bio: firestoreData.bio || 'No bio available',
            joinedDate: joinedDate,
          };
        }
        
        setUser(userData);
      } catch (error) {
        console.error('Error loading user data:', error);
        // Fallback to basic data if Firestore fails
        setUser({
          name: currentUser.displayName || 'User',
          email: currentUser.email || 'No email',
          course: 'No course specified',
          phone: 'No phone number',
          bio: 'No bio available',
          joinedDate: 'Unknown',
          avatar: currentUser.photoURL,
          uid: currentUser.uid
        });
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // Fetch additional user data from Firestore
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          let userData = {
            name: currentUser.displayName || 'User',
            email: currentUser.email || 'No email',
            course: 'No course specified',
            phone: 'No phone number',
            bio: 'No bio available',
            joinedDate: 'Unknown',
            avatar: currentUser.photoURL,
            uid: currentUser.uid
          };
          
          if (userDoc.exists()) {
            const firestoreData = userDoc.data();
            
            // Handle different date formats (ISO string vs Firestore timestamp)
            let joinedDate = 'Unknown';
            if (firestoreData.createdAt) {
              if (typeof firestoreData.createdAt === 'string') {
                // ISO string format
                joinedDate = new Date(firestoreData.createdAt).toLocaleDateString();
              } else if (firestoreData.createdAt.seconds) {
                // Firestore timestamp format
                joinedDate = new Date(firestoreData.createdAt.seconds * 1000).toLocaleDateString();
              }
            }
            
            userData = {
              ...userData,
              course: firestoreData.course || 'No course specified',
              phone: firestoreData.phone || 'No phone number',
              bio: firestoreData.bio || 'No bio available',
              joinedDate: joinedDate,
            };
          }
          
          setUser(userData);
        } catch (error) {
          console.error('Error loading user data:', error);
          // Fallback to basic data
          setUser({
            name: currentUser.displayName || 'User',
            email: currentUser.email || 'No email',
            course: 'No course specified',
            phone: 'No phone number',
            bio: 'No bio available',
            joinedDate: 'Unknown',
            avatar: currentUser.photoURL,
            uid: currentUser.uid
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Refresh user data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      refreshUserData();
    }, [])
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#E75C1A" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>No user logged in</Text>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.goBack()}>
          <Text style={styles.actionText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatarContainer}>
          {user.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{user.name.charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.course}>{user.course}</Text>
          <Text style={styles.joined}>Joined: {user.joinedDate}</Text>
          {user.phone !== 'No phone number' && (
            <Text style={styles.phone}>{user.phone}</Text>
          )}
          {user.bio !== 'No bio available' && (
            <Text style={styles.bio} numberOfLines={3}>{user.bio}</Text>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('EditProfile')}>
          <Text style={styles.actionText}>Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>Change Password</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#666' },
  errorText: { fontSize: 16, color: '#666', marginBottom: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: { padding: 8 },
  backIcon: { fontSize: 24, color: '#333' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  placeholder: { width: 40 },
  profileCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  avatarContainer: { marginRight: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 28, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700', color: '#333' },
  email: { fontSize: 14, color: '#666', marginTop: 4 },
  course: { fontSize: 14, color: '#666', marginTop: 2 },
  joined: { fontSize: 14, color: '#666', marginTop: 2 },
  phone: { fontSize: 14, color: '#666', marginTop: 2 },
  bio: { fontSize: 13, color: '#888', marginTop: 6, fontStyle: 'italic', lineHeight: 18 },
  actions: { paddingHorizontal: 16, marginTop: 12 },
  actionButton: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionText: { color: '#E75C1A', fontWeight: '700' },
});
