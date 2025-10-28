import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function SectionAnnouncementScreen() {
  const navigation = useNavigation();

  const announcements = [
    {
      id: 1,
      professor: 'Prof. Cuestas',
      timestamp: 'Oct 27, 2025 7:30 AM',
      message: 'Hello, good morning! My apologies for this late notice, I am attending a Zumba workshop. I will be uploading video lectures soonest. Thank you.',
      likes: 5,
      comments: 2
    },
    {
      id: 2,
      professor: 'Prof. Martinez',
      timestamp: 'Oct 26, 2025 2:15 PM',
      message: 'Reminder: Our midterm exam will be on November 5th. Please review chapters 1-6. Study guide will be posted tomorrow.',
      likes: 12,
      comments: 7
    },
    {
      id: 3,
      professor: 'Prof. Garcia',
      timestamp: 'Oct 25, 2025 9:45 AM',
      message: 'Great job on the group presentations yesterday! Grades will be posted by Friday. Keep up the excellent work.',
      likes: 8,
      comments: 3
    }
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Section Announcement</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Announcements List */}
      <ScrollView style={styles.content}>
        {announcements.map((announcement) => (
          <View key={announcement.id} style={styles.announcementCard}>
            <View style={styles.announcementHeader}>
              <View style={styles.profileIcon}>
                <Text style={styles.profileIconText}>👤</Text>
              </View>
              <View style={styles.announcementInfo}>
                <Text style={styles.professorName}>{announcement.professor}</Text>
                <Text style={styles.timestamp}>{announcement.timestamp}</Text>
              </View>
            </View>
            <Text style={styles.announcementText}>
              {announcement.message}
            </Text>
            <View style={styles.announcementActions}>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionIcon}>♡</Text>
                <Text style={styles.actionCount}>{announcement.likes}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionCount}>{announcement.comments}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add Announcement Button */}
      <TouchableOpacity style={styles.addButton}>
        <Text style={styles.addButtonText}>+ Add Announcement</Text>
      </TouchableOpacity>
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
    paddingTop: 16,
  },
  announcementCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileIconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  announcementInfo: {
    flex: 1,
  },
  professorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 13,
    color: '#888',
  },
  announcementText: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    marginBottom: 16,
  },
  announcementActions: {
    flexDirection: 'row',
    gap: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  actionIcon: {
    fontSize: 18,
    color: '#888',
  },
  actionCount: {
    fontSize: 14,
    color: '#888',
  },
  addButton: {
    backgroundColor: '#E75C1A',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});