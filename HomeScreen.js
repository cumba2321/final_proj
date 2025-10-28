import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

export default function HomeScreen() {
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [selectedSection, setSelectedSection] = useState('Section Announcement');
  const navigation = useNavigation();

  const handleSignOut = () => {
    signOut(auth).catch(error => alert(error.message));
  };

  const sectionOptions = [
    'Section Announcement',
    'Campus Announcement', 
    'Class Wall'
  ];

  const menuItems = [
    'Dashboard',
    'Section Task',
    'Section Announcement',
    'Campus Announcement',
    'My Events',
    'Attendance',
    'Progress'
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>PATHFIT</Text>
        <TouchableOpacity onPress={() => setShowSideMenu(true)} style={styles.menuButton}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* Section Dropdown */}
      <TouchableOpacity 
        style={styles.dropdown}
        onPress={() => setShowSectionDropdown(!showSectionDropdown)}
      >
        <Text style={styles.dropdownText}>{selectedSection}</Text>
        <Text style={styles.dropdownArrow}>▼</Text>
      </TouchableOpacity>

      {/* Dropdown Options */}
      {showSectionDropdown && (
        <View style={styles.dropdownOptions}>
          {sectionOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={styles.dropdownOption}
              onPress={() => {
                setSelectedSection(option);
                setShowSectionDropdown(false);
              }}
            >
              <Text style={styles.dropdownOptionText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Announcement Card */}
      <ScrollView style={styles.content}>
        <View style={styles.announcementCard}>
          <View style={styles.announcementHeader}>
            <View style={styles.profileIcon}>
              <Text style={styles.profileIconText}>👤</Text>
            </View>
            <View style={styles.announcementInfo}>
              <Text style={styles.professorName}>Prof. Cuestas</Text>
              <Text style={styles.timestamp}>Oct 27, 2025 7:30 AM</Text>
            </View>
          </View>
          <Text style={styles.announcementText}>
            Hello, good morning! My apologies for this late notice, 
            I am attending a Zumba workshop. I will be uploading 
            video lectures soonest. Thank you.
          </Text>
          <View style={styles.announcementActions}>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionIcon}>♡</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionIcon}>💬</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Side Menu Modal */}
      <Modal
        visible={showSideMenu}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSideMenu(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sideMenu}>
            <View style={styles.sideMenuHeader}>
              <Text style={styles.sideMenuTitle}>PATHFIT</Text>
              <TouchableOpacity onPress={() => setShowSideMenu(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.searchContainer}>
              <Text style={styles.searchPlaceholder}>Search</Text>
              <Text style={styles.searchIcon}>🔍</Text>
            </View>

            <ScrollView style={styles.menuItemsContainer}>
              {menuItems.map((item, index) => (
                <TouchableOpacity key={index} style={styles.menuItem}>
                  <Text style={styles.menuItemText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.userSection}>
              <View style={styles.userInfo}>
                <View style={styles.userIcon}>
                  <Text style={styles.userIconText}>👤</Text>
                </View>
                <View>
                  <Text style={styles.userName}>Ejine Mangcobihon</Text>
                  <TouchableOpacity>
                    <Text style={styles.userOption}>My Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity>
                    <Text style={styles.userOption}>Settings</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSignOut}>
                    <Text style={styles.userOption}>Log Out</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E75C1A',
    letterSpacing: 1,
  },
  menuButton: {
    padding: 8,
  },
  menuIcon: {
    fontSize: 24,
    color: '#333',
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  dropdownText: {
    fontSize: 16,
    color: '#333',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#666',
  },
  dropdownOptions: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    marginBottom: 8,
  },
  dropdownOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#333',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  announcementCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    marginHorizontal: 4,
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
    marginTop: 2,
  },
  announcementText: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    marginBottom: 16,
    marginTop: 8,
  },
  announcementActions: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 4,
  },
  actionButton: {
    padding: 6,
  },
  actionIcon: {
    fontSize: 20,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sideMenu: {
    width: '80%',
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 40,
  },
  sideMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sideMenuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E75C1A',
  },
  closeButton: {
    fontSize: 20,
    color: '#333',
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  searchPlaceholder: {
    color: '#999',
    fontSize: 16,
  },
  searchIcon: {
    fontSize: 16,
  },
  menuItemsContainer: {
    flex: 1,
    paddingVertical: 8,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
  },
  userSection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  userIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userIconText: {
    color: '#fff',
    fontSize: 18,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  userOption: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
});
