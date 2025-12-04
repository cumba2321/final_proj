import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator, } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

// 🔸 Default available events list
const defaultEvents = [
  { id: 1, title: 'PATHFit Fun Run', date: 'Nov 10, 2025', location: 'CDO Sports Complex' },
  { id: 2, title: 'Zumba Challenge', date: 'Nov 22, 2025', location: 'Campus Gym' },
  { id: 3, title: 'Beach Clean-Up Drive', date: 'Dec 1, 2025', location: 'Opol Beach' },
];

export default function MyEventsScreen() {
  const navigation = useNavigation();
  const [events, setEvents] = useState({ ongoing: [], upcoming: [], past: [] });
  const [availableEvents, setAvailableEvents] = useState(defaultEvents);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  // 🔹 Load events from Firestore
  useEffect(() => {
    const fetchEvents = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, 'studentEvents', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setEvents(docSnap.data());
        } else {
          await setDoc(docRef, { ongoing: [], upcoming: [], past: [] });
        }
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [user]);

  // 🔸 Join new event
  const joinEvent = async (event) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to join an event.');
      return;
    }

    try {
      const docRef = doc(db, 'studentEvents', user.uid);
      await updateDoc(docRef, { upcoming: arrayUnion(event) });

      setEvents((prev) => ({
        ...prev,
        upcoming: [...prev.upcoming, event],
      }));
      setAvailableEvents((prev) => prev.filter((e) => e.id !== event.id));
      setModalVisible(false);
      Alert.alert('Joined!', `You successfully joined "${event.title}".`);
    } catch (error) {
      console.error('Error joining event:', error);
      Alert.alert('Error', 'Could not join event. Please try again.');
    }
  };

  // 🟠 Move from Upcoming → Ongoing
  const startEvent = async (event) => {
    if (!user) return;

    try {
      const docRef = doc(db, 'studentEvents', user.uid);
      await updateDoc(docRef, {
        upcoming: arrayRemove(event),
        ongoing: arrayUnion(event),
      });

      setEvents((prev) => ({
        ...prev,
        upcoming: prev.upcoming.filter((e) => e.id !== event.id),
        ongoing: [...prev.ongoing, event],
      }));

      Alert.alert('Event Started', `"${event.title}" is now ongoing.`);
    } catch (error) {
      console.error('Error starting event:', error);
      Alert.alert('Error', 'Unable to start this event.');
    }
  };

  // 🟢 Move from Ongoing → Past
  const markAsCompleted = async (event) => {
    if (!user) return;

    try {
      const docRef = doc(db, 'studentEvents', user.uid);
      await updateDoc(docRef, {
        ongoing: arrayRemove(event),
        past: arrayUnion(event),
      });

      setEvents((prev) => ({
        ...prev,
        ongoing: prev.ongoing.filter((e) => e.id !== event.id),
        past: [...prev.past, event],
      }));

      Alert.alert('Completed!', `"${event.title}" moved to past events.`);
    } catch (error) {
      console.error('Error marking as completed:', error);
      Alert.alert('Error', 'Unable to update event status.');
    }
  };

  // 🔴 Delete a single past event
  const deletePastEvent = async (event) => {
    if (!user) return;

    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete "${event.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const docRef = doc(db, 'studentEvents', user.uid);
              await updateDoc(docRef, { past: arrayRemove(event) });

              setEvents((prev) => ({
                ...prev,
                past: prev.past.filter((e) => e.id !== event.id),
              }));

              Alert.alert('Deleted', `"${event.title}" has been removed.`);
            } catch (error) {
              console.error('Error deleting past event:', error);
              Alert.alert('Error', 'Unable to delete event. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ⚡ Delete all past events
  const deleteAllPastEvents = async () => {
    if (!user) return;

    Alert.alert(
      'Clear All Past Events',
      'Are you sure you want to delete all past events? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const docRef = doc(db, 'studentEvents', user.uid);
              await updateDoc(docRef, { past: [] });

              setEvents((prev) => ({
                ...prev,
                past: [],
              }));

              setAvailableEvents(defaultEvents); // 🔹 Restore default available events
              Alert.alert('Cleared', 'All past events have been deleted.');
            } catch (error) {
              console.error('Error deleting all past events:', error);
              Alert.alert('Error', 'Unable to clear past events. Please try again.');
            }
          },
        },
      ]
    );
  };

  // 🔄 Optional: Reset all (for development/demo)
  const resetAll = () => {
    setEvents({ ongoing: [], upcoming: [], past: [] });
    setAvailableEvents(defaultEvents);
    Alert.alert('Reset', 'All events have been reset.');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E75C1A" />
        <Text style={styles.loadingText}>Loading your events...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>My Events</Text>
        </View>
      </View>

      {/* --- Ongoing Events --- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="time-outline" size={20} color="#E75C1A" />
          <Text style={styles.sectionTitle}>Ongoing Events</Text>
        </View>
        {events.ongoing.length > 0 ? (
          events.ongoing.map((event, index) => (
            <View key={`${event.id}-${index}`} style={[styles.card, styles.ongoingCard]}>
              <Ionicons name="flash-outline" size={22} color="#fff" />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, styles.whiteText]}>{event.title}</Text>
                <Text style={[styles.cardDetail, styles.whiteText]}>{event.date}</Text>
                <Text style={[styles.cardDetail, styles.whiteText]}>{event.location}</Text>
              </View>
              <TouchableOpacity style={styles.doneButton} onPress={() => markAsCompleted(event)}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.noEvent}>No ongoing events.</Text>
        )}
      </View>

      {/* --- Upcoming Events --- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="calendar-outline" size={20} color="#E75C1A" />
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
        </View>
        {events.upcoming.length > 0 ? (
          events.upcoming.map((event, index) => (
            <View key={`${event.id}-${index}`} style={styles.card}>
              <Ionicons name="calendar-number-outline" size={22} color="#E75C1A" />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, styles.blackText]}>{event.title}</Text>
                <Text style={[styles.cardDetail, styles.blackText]}>{event.date}</Text>
                <Text style={[styles.cardDetail, styles.blackText]}>{event.location}</Text>
              </View>
              <TouchableOpacity style={styles.startButton} onPress={() => startEvent(event)}>
                <Text style={styles.startText}>Start</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.noEvent}>No upcoming events.</Text>
        )}
      </View>

      {/* --- Past Events --- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="trophy-outline" size={20} color="#E75C1A" />
          <Text style={styles.sectionTitle}>Past Events</Text>
          {events.past.length > 0 && (
            <TouchableOpacity style={styles.deleteAllButton} onPress={deleteAllPastEvents}>
              <Text style={styles.deleteAllText}>Delete All</Text>
            </TouchableOpacity>
          )}
        </View>
        {events.past.length > 0 ? (
          events.past.map((event, index) => (
            <View key={`${event.id}-${index}`} style={[styles.card, styles.pastCard]}>
              <Ionicons name="checkmark-done-circle-outline" size={22} color="#E75C1A" />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, styles.blackText]}>{event.title}</Text>
                <Text style={[styles.cardDetail, styles.blackText]}>{event.date}</Text>
                <Text style={[styles.cardDetail, styles.blackText]}>{event.location}</Text>
              </View>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deletePastEvent(event)}>
                <Ionicons name="trash-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.noEvent}>No past events.</Text>
        )}
      </View>

      {/* --- Join Event Button --- */}
      <TouchableOpacity style={styles.joinButton} onPress={() => setModalVisible(true)}>
        <Ionicons name="add-circle-outline" size={22} color="#fff" />
        <Text style={styles.joinText}>Join New Event</Text>
      </TouchableOpacity>

      {/* 🔄 Optional Reset Button */}
      <TouchableOpacity onPress={resetAll}>
        <Text style={styles.resetText}>Reset All Events</Text>
      </TouchableOpacity>

      {/* --- Modal for Joining --- */}
      <Modal animationType="slide" transparent visible={modalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Available Events</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {availableEvents.length > 0 ? (
                availableEvents.map((event, index) => (
                  <View key={`${event.id}-${index}`} style={styles.modalCard}>
                    <Text style={[styles.modalEventTitle, styles.blackText]}>{event.title}</Text>
                    <Text style={[styles.modalEventDetail, styles.blackText]}>{event.date}</Text>
                    <Text style={[styles.modalEventDetail, styles.blackText]}>{event.location}</Text>
                    <TouchableOpacity style={styles.joinNowBtn} onPress={() => joinEvent(event)}>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.joinNowText}>Join Now</Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <Text style={styles.noEvent}>No available events.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
    fontSize: 24,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: 1,
    marginTop: 6,	
    marginLeft: -20,
  },
  placeholder: {
    width: 40,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  resetText: { 
    color: '#E75C1A', 
    textAlign: 'center', 
    marginBottom: 20 
  },
  section: { 
    marginBottom: 24 
  },
  sectionHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 16,
    marginBottom: 10, 
    marginLeft: 16
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#E75C1A', 
    marginLeft: 8 
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 3,
  },
  ongoingCard: { backgroundColor: '#042175' },
  pastCard: { opacity: 0.85 },
  cardInfo: { marginLeft: 10, flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  blackText: { color: '#000' },
  whiteText: { color: '#fff' },
  cardDetail: { fontSize: 14 },
  startButton: {
    backgroundColor: '#E75C1A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  startText: { color: '#fff', fontWeight: 'bold' },
  doneButton: {
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  doneText: { 
    color: '#042175', 
    fontWeight: 'bold' },
  deleteButton: {
    backgroundColor: '#E75C1A',
    borderRadius: 8,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAllButton: {
    marginLeft: 'auto',
    backgroundColor: '#E75C1A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  deleteAllText: { 
    color: '#fff', 
    fontWeight: 'bold', 
    fontSize: 13 
  },
  noEvent: { 
    color: '#999', 
    fontStyle: 'italic', 
    marginLeft: 20 
  },
  joinButton: {
    flexDirection: 'row',
    backgroundColor: '#E75C1A',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 30,
  },
  joinText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
    joinButton: {
    flexDirection: 'row',
    backgroundColor: '#E75C1A',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 30,
  },
  modalContainer: {
    backgroundColor: '#fff',
    width: '90%',
    maxHeight: '80%',
    borderRadius: 15,
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E75C1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  modalEventTitle: { fontSize: 16, fontWeight: 'bold' },
  modalEventDetail: { fontSize: 14 },
  joinNowBtn: {
    marginTop: 10,
    backgroundColor: '#042175',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  joinNowText: { color: '#fff', fontWeight: 'bold' },
  closeModalBtn: {
    backgroundColor: '#E75C1A',
    marginTop: 15,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeModalText: { color: '#fff', fontWeight: 'bold' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafc' },
  loadingText: { marginTop: 10, color: '#555' },
  
});
