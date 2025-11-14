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
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(auth.currentUser);
  }, []);

  const handleSignOut = () => {
    signOut(auth).catch(error => alert(error.message));
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
});
