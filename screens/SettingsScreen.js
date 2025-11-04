import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(auth.currentUser);
  }, []);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            signOut(auth)
              .then(() => {
                console.log('User signed out');
              })
              .catch(error => {
                Alert.alert('Error', error.message);
              });
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Cascade deletion functions
  const deleteAllUserPosts = async (userId) => {
    if (!userId || !db) return;

    try {
      console.log('Starting cascade deletion for user:', userId);
      
      // Query posts by specific user ID (more efficient)
      const postsQuery = query(
        collection(db, 'classWall'),
        where('authorId', '==', userId)
      );
      const querySnapshot = await getDocs(postsQuery);
      
      const deletionPromises = [];
      let deletedCount = 0;
      
      querySnapshot.forEach((docSnapshot) => {
        deletionPromises.push(deleteDoc(doc(db, 'classWall', docSnapshot.id)));
        deletedCount++;
      });
      
      // Execute all deletions in parallel
      await Promise.all(deletionPromises);
      
      console.log(`Successfully deleted ${deletedCount} posts for user ${userId}`);
      return deletedCount;
    } catch (error) {
      console.error('Error in cascade deletion:', error);
      throw error;
    }
  };

  const deleteUserAccount = async () => {
    const currentUserId = user?.uid;
    if (!currentUserId) {
      Alert.alert('Error', 'No user logged in');
      return;
    }

    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This will permanently delete your account and all your posts. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Account', 
          style: 'destructive', 
          onPress: async () => {
            try {
              // Step 1: Delete all user's posts
              const deletedPostsCount = await deleteAllUserPosts(currentUserId);
              
              // Step 2: Delete user document from Firestore
              if (db) {
                await deleteDoc(doc(db, 'users', currentUserId));
              }
              
              // Step 3: Delete Firebase Auth account
              if (auth.currentUser) {
                await auth.currentUser.delete();
              }
              
              Alert.alert(
                'Account Deleted', 
                `Your account and ${deletedPostsCount} posts have been permanently deleted.`,
                [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
              );
              
            } catch (error) {
              console.error('Error deleting account:', error);
              if (error.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication Required',
                  'For security reasons, please log out and log back in before deleting your account.'
                );
              } else {
                Alert.alert('Error', 'Failed to delete account. Please try again.');
              }
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* User Info Section */}
        {user && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.userInfo}>
              <Text style={styles.userEmail}>{user.email}</Text>
              <Text style={styles.userDisplayName}>
                {user.displayName || 'No display name set'}
              </Text>
            </View>
          </View>
        )}

        {/* Account Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={() => navigation.navigate('MyProfile')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Edit Profile</Text>
              <Text style={styles.settingDescription}>
                Update your profile information
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleSignOut}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Sign Out</Text>
              <Text style={styles.settingDescription}>
                Sign out of your account
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, styles.dangerItem]} onPress={deleteUserAccount}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, styles.dangerText]}>Delete Account</Text>
              <Text style={styles.settingDescription}>
                Permanently delete your account and all data
              </Text>
            </View>
            <Text style={[styles.arrow, styles.dangerText]}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    backgroundColor: '#fff',
    borderBottomColor: '#eee',
  },
  backButton: { padding: 8 },
  backIcon: { 
    fontSize: 24,
    color: '#333',
  },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: { width: 40 },
  content: { 
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    margin: 16,
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  userInfo: {
    paddingVertical: 8,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  userDisplayName: {
    fontSize: 14,
    marginTop: 4,
    color: '#666',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  settingDescription: {
    fontSize: 14,
    marginTop: 2,
    color: '#666',
  },
  arrow: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666',
  },
  dangerItem: {
    borderBottomWidth: 0, // Remove border for last item
  },
  dangerText: {
    color: '#d32f2f', // Red color for delete action
  },
});
