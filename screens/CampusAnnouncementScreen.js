import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CampusAnnouncementScreen() {
  const navigation = useNavigation();

  const announcements = [
    {
      id: 1,
      title: 'Campus Health and Safety Protocol Update',
      department: 'Health Services',
      timestamp: 'Oct 28, 2025 8:00 AM',
      priority: 'high',
      message: 'New health and safety protocols are now in effect. All students and faculty must follow the updated guidelines when entering campus facilities.',
      category: 'Health & Safety',
    },
    {
      id: 2,
      title: 'Library Extended Hours During Finals Week',
      department: 'Library Services',
      timestamp: 'Oct 27, 2025 2:30 PM',
      priority: 'medium',
      message: 'The campus library will be open 24/7 starting November 1st through November 15th to support students during finals preparation.',
      category: 'Academic',
    },
    {
      id: 3,
      title: 'Campus Wi-Fi Maintenance',
      department: 'IT Services',
      timestamp: 'Oct 26, 2025 4:15 PM',
      priority: 'medium',
      message: 'Scheduled maintenance on campus Wi-Fi network will occur this Saturday from 2:00 AM to 6:00 AM. Some connectivity issues may be experienced.',
      category: 'Technology',
    },
    {
      id: 4,
      title: 'Student Activities Fair',
      department: 'Student Affairs',
      timestamp: 'Oct 25, 2025 10:00 AM',
      priority: 'low',
      message: 'Join us for the annual Student Activities Fair on November 3rd at the main quad. Discover clubs, organizations, and volunteer opportunities.',
      category: 'Events',
    },
    {
      id: 5,
      title: 'Parking Lot C Closure',
      department: 'Facilities Management',
      timestamp: 'Oct 24, 2025 3:45 PM',
      priority: 'high',
      message: 'Parking Lot C will be closed for maintenance from October 30th to November 5th. Please use alternative parking areas.',
      category: 'Facilities',
    }
  ];

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#FF5252';
      case 'medium': return '#FF9800';
      case 'low': return '#4CAF50';
      default: return '#757575';
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Health & Safety': return '#E53E3E';
      case 'Academic': return '#3182CE';
      case 'Technology': return '#805AD5';
      case 'Events': return '#38A169';
      case 'Facilities': return '#D69E2E';
      default: return '#718096';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Campus Announcements</Text>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Categories */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filterContainer}
      >
        <TouchableOpacity style={[styles.filterChip, styles.activeFilter]}>
          <Text style={[styles.filterText, styles.activeFilterText]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterText}>Academic</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterText}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterText}>Health & Safety</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterText}>Facilities</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Announcements List */}
      <ScrollView style={styles.content}>
        {announcements.map((announcement) => (
          <View key={announcement.id} style={styles.announcementCard}>
            {/* Priority Indicator */}
            <View style={[styles.priorityIndicator, { backgroundColor: getPriorityColor(announcement.priority) }]} />
            
            <View style={styles.cardContent}>
              <View style={styles.announcementHeader}>
                <View style={styles.headerTop}>
                  <Text style={styles.announcementTitle}>{announcement.title}</Text>
                  <View style={[styles.categoryTag, { backgroundColor: getCategoryColor(announcement.category) + '20' }]}>
                    <Text style={[styles.categoryText, { color: getCategoryColor(announcement.category) }]}>
                      {announcement.category}
                    </Text>
                  </View>
                </View>
                <View style={styles.headerBottom}>
                  <Text style={styles.department}>{announcement.department}</Text>
                  <Text style={styles.timestamp}>{announcement.timestamp}</Text>
                </View>
              </View>
              
              <Text style={styles.announcementText}>
                {announcement.message}
              </Text>
              
              <View style={styles.announcementActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>📌</Text>
                  <Text style={styles.actionText}>Pin</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>📤</Text>
                  <Text style={styles.actionText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>🔔</Text>
                  <Text style={styles.actionText}>Notify</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
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
  filterButton: {
    padding: 8,
  },
  filterIcon: {
    fontSize: 20,
    color: '#666',
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    marginRight: 8,
  },
  activeFilter: {
    backgroundColor: '#E75C1A',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeFilterText: {
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  announcementCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  priorityIndicator: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  announcementHeader: {
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  headerBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  department: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E75C1A',
  },
  timestamp: {
    fontSize: 12,
    color: '#888',
  },
  announcementText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 16,
  },
  announcementActions: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});
