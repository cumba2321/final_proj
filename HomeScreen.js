import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function HomeScreen() {
  const [showTasks, setShowTasks] = useState(false);
  const navigation = useNavigation();

  const handleSignOut = () => {
    signOut(auth).catch(error => alert(error.message));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Home</Text>
        <View style={styles.headerIcons}>
          {/* Replace with your icons */}
          <Text>🔔 💬 👤</Text>
          <TouchableOpacity onPress={handleSignOut}>
            <Text>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.title}>PATHFIT</Text>
      <View style={styles.section}>
        <TouchableOpacity onPress={() => setShowTasks(!showTasks)}>
          <Text style={styles.sectionTitle}>Section Task</Text>
        </TouchableOpacity>
        {showTasks && (
          <>
            <TouchableOpacity style={styles.taskButtonActive} onPress={() => navigation.navigate('Classwork')}>
              <Text style={styles.taskTextActive}>View assigned weekly task</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.taskButton} onPress={() => navigation.navigate('InstructorFeedback')}>
              <Text style={styles.taskText}>Receive instructor feedback</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <View style={styles.section}>
        <TouchableOpacity onPress={() => navigation.navigate('CampusAnnouncement')}>
          <Text style={styles.sectionTitle}>Campus Announcement</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.section}>
        <TouchableOpacity onPress={() => navigation.navigate('Progress')}>
          <Text style={styles.sectionTitle}>Progress</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 32,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#E75C1A',
    alignSelf: 'center',
    marginVertical: 12,
    letterSpacing: 2,
  },
  section: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
    fontSize: 16,
  },
  taskButtonActive: {
    backgroundColor: '#D6F3F7',
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
  },
  taskTextActive: {
    color: '#333',
    fontWeight: 'bold',
  },
  taskButton: {
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
  },
  taskText: {
    color: '#333',
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#E0E0E0',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
  },
  navItem: {
    alignItems: 'center',
  },
});
