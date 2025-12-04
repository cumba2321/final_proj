import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert, RefreshControl, Image, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, doc, getDoc, query, where, onSnapshot, serverTimestamp, deleteDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export default function SectionAnnouncementScreen() {
  const navigation = useNavigation();
  const [rawAnnouncements, setRawAnnouncements] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userClasses, setUserClasses] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  
  // Create announcement state
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    message: '',
    targetType: 'campus',
    targetClassId: null,
    targetClassName: '',
    targetSection: null,
    image: null,
    files: [],
    links: []
  });
  
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState('campus');
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);

  // Announcement menu functionality
  const [showAnnouncementMenu, setShowAnnouncementMenu] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showEditAnnouncementModal, setShowEditAnnouncementModal] = useState(false);
  const [editAnnouncement, setEditAnnouncement] = useState({
    title: '',
    message: '',
    image: null,
    files: [],
    links: []
  });
  const [editSelectedImages, setEditSelectedImages] = useState([]);
  const [editSelectedFiles, setEditSelectedFiles] = useState([]);
  // Add editPostText state similar to HomeScreen
  const [editPostText, setEditPostText] = useState('');
  const [editingPost, setEditingPost] = useState(null);

  // Safety check for db
  const announcementsCollectionRef = db ? collection(db, 'sectionAnnouncements') : null;

  // Filter announcements based on user's classes using useMemo to prevent infinite loops
  const announcements = useMemo(() => {
    if (!rawAnnouncements.length) return [];
    
    const filteredAnnouncements = rawAnnouncements.filter(announcement => {
      // Campus announcements are visible to everyone
      if (announcement.targetType === 'campus') {
        return true;
      }
      
      // Section-specific announcements are only visible to users in that class/section
      if (announcement.targetType === 'section') {
        // Check if user is in the target class
        return userClasses.some(userClass => 
          userClass.id === announcement.targetClassId
        );
      }
      
      // Default: show the announcement
      return true;
    });
    
    console.log('🔍 Filtering announcements:', rawAnnouncements.length, '→', filteredAnnouncements.length);
    return filteredAnnouncements;
  }, [rawAnnouncements, userClasses]);

  // Add loading state
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user authentication and role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const role = await fetchUserRole(user);
        if (role === 'instructor') {
          await fetchUserClasses(user);
        } else {
          await fetchUserEnrolledClasses(user);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Set up real-time listener for announcements
  useEffect(() => {
    // Only set up listener if user is logged in and has role
    if (!currentUser || !userRole || !announcementsCollectionRef) return;

    console.log('🔴 Setting up real-time listener for announcements');
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(announcementsCollectionRef, (snapshot) => {
      console.log('🔥 Real-time update received at:', new Date().toLocaleTimeString());
      setIsAutoRefreshing(true);
      setRefreshCount(prev => prev + 1);
      setLastRefreshTime(new Date());
      
      try {
        const fetchedAnnouncements = snapshot.docs.map((doc) => ({ 
          ...doc.data(), 
          id: doc.id 
        }));
        
        console.log('📨 Real-time announcements received:', fetchedAnnouncements.length);
        
        // Sort by timestamp (newest first)
        fetchedAnnouncements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setRawAnnouncements(fetchedAnnouncements);
        
        // Hide refresh indicator after a short delay
        setTimeout(() => setIsAutoRefreshing(false), 1000);
        
      } catch (error) {
        console.error('❌ Error processing real-time update:', error);
        setIsAutoRefreshing(false);
      }

      // Add loading to false after first load
      setIsLoading(false);
    }, (error) => {
      console.error('❌ Real-time listener error:', error);
      setIsAutoRefreshing(false);
      setIsLoading(false);
    });
    
    // Cleanup listener when component unmounts
    return () => {
      console.log('🔴 Cleaning up real-time listener');
      unsubscribe();
    };
  }, [currentUser?.uid, userRole]); // Only depend on user ID and role to avoid loops

  // Fetch user role from Firestore
  const fetchUserRole = async (user) => {
    if (user && db) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          setUserRole(role);
          return role;
        } else {
          setUserRole('student');
          return 'student';
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        setUserRole('student');
        return 'student';
      }
    }
    return 'student';
  };

  // Fetch classes where user is instructor
  const fetchUserClasses = async (user) => {
    if (user && db) {
      try {
        const classesCollection = collection(db, 'classes');
        const q = query(classesCollection, where('createdBy', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const classes = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUserClasses(classes);
        // Refresh announcements after classes are loaded
        setTimeout(() => getAnnouncements(), 100);
      } catch (error) {
        console.error('Error fetching user classes:', error);
      }
    }
  };

  // Fetch classes where user is enrolled (for students)
  const fetchUserEnrolledClasses = async (user) => {
    if (user && db) {
      try {
        const classesCollection = collection(db, 'classes');
        const q = query(classesCollection, where('students', 'array-contains', user.uid));
        const querySnapshot = await getDocs(q);
        const classes = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUserClasses(classes);
        // Refresh announcements after classes are loaded
        setTimeout(() => getAnnouncements(), 100);
      } catch (error) {
        console.error('Error fetching enrolled classes:', error);
      }
    }
  };

  const getAnnouncements = async () => {
    if (!announcementsCollectionRef) return;
    try {
      console.log('🔄 Manual refresh triggered at:', new Date().toLocaleTimeString());
      setRefreshing(true);
      // The real-time listener will handle the actual data fetching
      // This is just for manual pull-to-refresh visual feedback
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
    } catch (error) {
      console.error('Error in manual refresh:', error);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    console.log('📱 Pull-to-refresh triggered');
    getAnnouncements();
  };

  // Handle image picker
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        setNewAnnouncement(prev => ({
          ...prev,
          image: result.assets[0].uri
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  // Handle document picker
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled) {
        const newFiles = result.assets.map(file => ({
          name: file.name,
          uri: file.uri,
          size: file.size,
          type: file.mimeType
        }));
        
        setNewAnnouncement(prev => ({
          ...prev,
          files: [...prev.files, ...newFiles]
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  // Handle adding links
  const addLink = () => {
    Alert.prompt(
      'Add Link',
      'Enter the URL:',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Add',
          onPress: (url) => {
            if (url && url.trim()) {
              const formattedUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
              setNewAnnouncement(prev => ({
                ...prev,
                links: [...prev.links, formattedUrl]
              }));
            }
          }
        }
      ],
      'plain-text'
    );
  };

  // Remove attachments
  const removeImage = () => {
    setNewAnnouncement(prev => ({ ...prev, image: null }));
  };

  const removeFile = (index) => {
    setNewAnnouncement(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }));
  };

  const removeLink = (index) => {
    setNewAnnouncement(prev => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index)
    }));
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const addAnnouncement = async () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.message.trim() || !announcementsCollectionRef || !currentUser) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    
    if (selectedTarget === 'section' && (!selectedClass || !selectedSection)) {
      Alert.alert('Error', 'Please select a class and section for section announcements');
      return;
    }

    try {
      const announcementData = {
        title: newAnnouncement.title.trim(),
        message: newAnnouncement.message.trim(),
        professor: currentUser?.displayName || currentUser?.email || 'Instructor',
        professorId: currentUser.uid,
        createdBy: currentUser.uid, // Add this required field
        timestamp: new Date().toISOString(),
        createdAt: new Date(),
        likes: 0,
        comments: 0,
        targetType: selectedTarget,
        image: newAnnouncement.image || null,
        files: newAnnouncement.files || [],
        links: newAnnouncement.links || [],
        ...(selectedTarget === 'section' && {
          targetClassId: selectedClass.id,
          targetClassName: selectedClass.name,
          targetSection: selectedSection
        })
      };

      await addDoc(announcementsCollectionRef, announcementData);

      // Also save to classWall collection for home screen display
      if (db) {
        const classWallData = {
          author: currentUser?.displayName || currentUser?.email || 'Instructor',
          authorId: currentUser.uid,
          authorAvatar: currentUser?.photoURL || null,
          role: 'Instructor',
          message: `${newAnnouncement.title.trim()}\n\n${newAnnouncement.message.trim()}`,
          audience: selectedTarget === 'campus' ? 'Public' : 'Class',
          selectedSections: selectedTarget === 'section' ? [{ 
            id: selectedClass.id, 
            name: selectedClass.name, 
            section: selectedSection 
          }] : [],
          likes: 0,
          comments: 0,
          image: newAnnouncement.image || null,
          files: newAnnouncement.files || [],
          isAnnouncement: true, // Flag to identify this as an announcement
          originalAnnouncementData: announcementData, // Store original announcement data
          createdAt: serverTimestamp()
        };

        await addDoc(collection(db, 'classWall'), classWallData);
      }
      
      // Reset form
      setNewAnnouncement({
        title: '',
        message: '',
        targetType: 'campus',
        targetClassId: null,
        targetClassName: '',
        targetSection: null,
        image: null,
        files: [],
        links: []
      });
      setSelectedTarget('campus');
      setSelectedClass(null);
      setSelectedSection(null);
      setShowCreateModal(false);
      
      const targetMessage = selectedTarget === 'campus' 
        ? 'Campus announcement posted successfully!'
        : `Section announcement posted to ${selectedClass?.name} - ${selectedSection}`;
      Alert.alert('Success', targetMessage);
    } catch (error) {
      console.error('Error adding announcement:', error);
      Alert.alert('Error', 'Failed to post announcement');
    }
  };

  // Announcement menu functions
  const openAnnouncementMenu = (announcement) => {
    setSelectedAnnouncement(announcement);
    setShowAnnouncementMenu(true);
  };

  const closeAnnouncementMenu = () => {
    setShowAnnouncementMenu(false);
    setSelectedAnnouncement(null);
  };

  const deleteAnnouncement = async () => {
    if (!selectedAnnouncement || !currentUser) {
      Alert.alert('Error', 'Unable to delete announcement');
      return;
    }

    // Security check: Only allow deletion if user owns the announcement
    if (selectedAnnouncement.professorId !== currentUser.uid) {
      Alert.alert('Error', 'You do not have permission to delete this announcement');
      return;
    }

    try {
      // Delete from sectionAnnouncements collection
      if (db && selectedAnnouncement.id) {
        const announcementRef = doc(db, 'sectionAnnouncements', selectedAnnouncement.id);
        await deleteDoc(announcementRef);
        console.log('Announcement deleted from sectionAnnouncements:', selectedAnnouncement.id);
      }

      // Also delete from classWall collection if it exists there
      if (db) {
        const classWallQuery = query(
          collection(db, 'classWall'), 
          where('originalAnnouncementData.id', '==', selectedAnnouncement.id)
        );
        const classWallSnapshot = await getDocs(classWallQuery);
        
        classWallSnapshot.forEach(async (doc) => {
          await deleteDoc(doc.ref);
          console.log('Announcement deleted from classWall:', doc.id);
        });
      }

      // Update local state
      setRawAnnouncements(prev => prev.filter(ann => ann.id !== selectedAnnouncement.id));
      
      closeAnnouncementMenu();
      Alert.alert('Success', 'Announcement deleted successfully');
    } catch (error) {
      console.error('Error deleting announcement:', error);
      Alert.alert('Error', 'Failed to delete announcement. Please try again.');
    }
  };

  const openEditAnnouncementModal = () => {
    if (!selectedAnnouncement) return;
    
    // Security check: Only allow editing if user owns the announcement
    if (selectedAnnouncement.professorId !== currentUser?.uid) {
      Alert.alert('Error', 'You do not have permission to edit this announcement.');
      closeAnnouncementMenu();
      return;
    }
    
    // Initialize edit state with current announcement data (HomeScreen style)
    const combinedText = selectedAnnouncement.title && selectedAnnouncement.message 
      ? `${selectedAnnouncement.title}\n\n${selectedAnnouncement.message}`
      : (selectedAnnouncement.title || selectedAnnouncement.message || '');
    
    setEditingPost(selectedAnnouncement);
    setEditPostText(combinedText);
    setEditAnnouncement({
      title: selectedAnnouncement.title || '',
      message: selectedAnnouncement.message || '',
      image: selectedAnnouncement.image || null,
      files: selectedAnnouncement.files || [],
      links: selectedAnnouncement.links || []
    });
    
    // Initialize with existing media if any
    setEditSelectedImages(selectedAnnouncement.image ? [{ uri: selectedAnnouncement.image, name: 'image.jpg', size: 0 }] : []);
    setEditSelectedFiles(selectedAnnouncement.files || []);
    
    console.log('Opening edit modal with:', {
      combinedText,
      title: selectedAnnouncement.title,
      message: selectedAnnouncement.message,
      hasImage: !!selectedAnnouncement.image,
      filesCount: selectedAnnouncement.files?.length || 0
    });
    
    setShowEditAnnouncementModal(true);
    closeAnnouncementMenu();
  };

  const closeEditAnnouncementModal = () => {
    setShowEditAnnouncementModal(false);
    setEditingPost(null);
    setEditPostText('');
    setEditAnnouncement({
      title: '',
      message: '',
      image: null,
      files: [],
      links: []
    });
    setEditSelectedImages([]);
    setEditSelectedFiles([]);
  };

  const updateAnnouncement = async () => {
    // Use exact same validation as HomeScreen
    if (!editingPost || (!editPostText.trim() && editSelectedImages.length === 0 && editSelectedFiles.length === 0)) {
      Alert.alert('Error', 'Please add some content to your post');
      return;
    }

    try {
      // Parse the editPostText back to title and message for announcement storage
      const lines = editPostText.split('\n');
      const firstLine = lines[0] || '';
      const restLines = lines.slice(1).join('\n').replace(/^\n+/, '');

      const updatedData = {
        title: firstLine.trim(),
        message: restLines.trim(),
        image: editSelectedImages.length > 0 ? editSelectedImages[0].uri : null,
        files: editSelectedFiles.map(file => ({
          name: file.name,
          size: file.size,
          type: file.type,
          uri: file.uri
        })),
        updatedAt: serverTimestamp()
      };

      // Update in sectionAnnouncements collection
      if (db && editingPost.id) {
        const announcementRef = doc(db, 'sectionAnnouncements', editingPost.id);
        await updateDoc(announcementRef, updatedData);
        console.log('Updated announcement in sectionAnnouncements:', editingPost.id);
      }

      // Also update in classWall collection if it exists there
      if (db) {
        const classWallQuery = query(
          collection(db, 'classWall'), 
          where('isAnnouncement', '==', true),
          where('authorId', '==', currentUser?.uid)
        );
        const classWallSnapshot = await getDocs(classWallQuery);
        
        // Find and update the matching announcement in classWall
        const classWallDocs = classWallSnapshot.docs.filter(doc => {
          const data = doc.data();
          return data.originalAnnouncementData && 
                 (data.originalAnnouncementData.id === editingPost.id ||
                  (data.originalAnnouncementData.title === editingPost.title && 
                   data.originalAnnouncementData.message === editingPost.message));
        });

        for (const docRef of classWallDocs) {
          await updateDoc(docRef.ref, {
            message: editPostText,
            image: editSelectedImages.length > 0 ? editSelectedImages[0].uri : null,
            files: editSelectedFiles.map(file => ({
              name: file.name,
              size: file.size,
              type: file.type,
              uri: file.uri
            })),
            'originalAnnouncementData.title': firstLine.trim(),
            'originalAnnouncementData.message': restLines.trim(),
            'originalAnnouncementData.image': editSelectedImages.length > 0 ? editSelectedImages[0].uri : null,
            'originalAnnouncementData.files': editSelectedFiles.map(file => ({
              name: file.name,
              size: file.size,
              type: file.type,
              uri: file.uri
            })),
            updatedAt: serverTimestamp()
          });
          console.log('Updated announcement in classWall:', docRef.id);
        }
      }

      // Update local state
      setRawAnnouncements(prev => prev.map(ann => 
        ann.id === editingPost.id 
          ? { ...ann, ...updatedData }
          : ann
      ));

      closeEditAnnouncementModal();
      Alert.alert('Success', 'Announcement updated successfully in both announcement screen and home screen');
    } catch (error) {
      console.error('Error updating announcement:', error);
      Alert.alert('Error', 'Failed to update announcement');
    }
  };

  // Edit announcement helper functions (copied from HomeScreen)
  const handleEditImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imageData = {
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          size: asset.fileSize || 0,
          type: asset.type || 'image/jpeg'
        };
        
        setEditSelectedImages([imageData]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleEditCameraPicker = async () => {
    try {
      // Request camera permission
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      
      if (cameraPermission.granted === false) {
        Alert.alert('Permission Required', 'Please allow camera access to take photos.');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imageData = {
          uri: asset.uri,
          name: `photo_${Date.now()}.jpg`,
          size: asset.fileSize || 0,
          type: 'image/jpeg'
        };
        
        setEditSelectedImages([imageData]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleEditFilePicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileData = {
          uri: file.uri,
          name: file.name,
          size: file.size,
          type: file.mimeType
        };
        
        setEditSelectedFiles(prev => [...prev, fileData]);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  // Helper to validate URLs
  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Announcements</Text>
          {/* <Text style={styles.subtitle}>
            Campus & Section Updates • Real-time ({refreshCount})
            {lastRefreshTime && ` • Updated ${lastRefreshTime.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}`}
            {isAutoRefreshing && ' �'}
          </Text> */}
        </View>
        {userRole === 'instructor' && (
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#E75C1A']}
            tintColor="#E75C1A"
          />
        }
      >
        {isLoading ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Text style={{ fontSize: 24, color: '#E75C1A' }}>Loading...</Text>
          </View>
        ) : announcements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📢</Text>
            <Text style={styles.emptyStateTitle}>No announcements yet</Text>
            <Text style={styles.emptyStateText}>
              {userRole === 'instructor' 
                ? 'Create your first announcement to get started!'
                : 'No announcements have been posted yet.'
              }
            </Text>
          </View>
        ) : (
          announcements.map((announcement) => (
            <View key={announcement.id} style={styles.postCard}>
              <View style={styles.postHeader}>
                <View style={styles.profileIcon}>
                  <Text style={styles.profileIconText}>
                    {announcement.professor?.charAt(0)?.toUpperCase() || '👨‍🏫'}
                  </Text>
                </View>
                <View style={styles.postInfo}>
                  <View style={styles.authorRow}>
                    <Text style={styles.authorName}>{announcement.professor}</Text>
                    <Text style={[styles.roleTag, styles.instructorTag]}>
                      Instructor
                    </Text>
                  </View>
                  <View style={styles.timestampRow}>
                    <Text style={styles.timestamp}>
                      {new Date(announcement.timestamp).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </Text>
                    <View style={styles.audienceIndicator}>
                      <Text style={styles.audienceIcon}>
                        {announcement.targetType === 'campus' ? '🏫' : '📚'}
                      </Text>
                      <Text style={styles.audienceText}>
                        {announcement.targetType === 'campus' ? 'Campus' : 
                         `${announcement.targetClassName} - ${announcement.targetSection}`}
                      </Text>
                    </View>
                  </View>
                </View>
                {/* Only show menu button for announcements owned by current user */}
                {currentUser?.uid && announcement.professorId && currentUser.uid === announcement.professorId && (
                  <TouchableOpacity 
                    style={styles.announcementMenuButton}
                    onPress={() => openAnnouncementMenu(announcement)}
                  >
                    <Text style={styles.announcementMenuIcon}>⋯</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {announcement.title && announcement.title !== 'Announcement' && (
                <Text style={styles.announcementTitle}>
                  {announcement.title}
                </Text>
              )}
              
              <Text style={styles.postText}>
                {announcement.message}
              </Text>
              
              {/* Display Image */}
              {announcement.image && (
                <Image source={{ uri: announcement.image }} style={styles.postImage} />
              )}

              {/* Display Files - make clickable */}
              {announcement.files && announcement.files.length > 0 && (
                <View style={styles.postFiles}>
                  <Text style={styles.postFilesLabel}>Attachments:</Text>
                  {announcement.files.slice(0, 2).map((file, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.postFileItem}
                      onPress={() => Linking.openURL(file.uri)}
                    >
                      <Text style={styles.postFileIcon}>📎</Text>
                      <View style={styles.postFileInfo}>
                        <Text style={styles.postFileName} numberOfLines={1}>{file.name}</Text>
                        <Text style={styles.postFileSize}>{formatFileSize(file.size)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {announcement.files.length > 2 && (
                    <Text style={styles.moreFilesText}>+{announcement.files.length - 2} more files</Text>
                  )}
                </View>
              )}

              {/* Display Links - add Copy Link option */}
              {announcement.links && announcement.links.length > 0 && (
                <View style={styles.postLinks}>
                  <Text style={styles.postLinksLabel}>Links:</Text>
                  {announcement.links.map((link, index) => (
                    <View key={index} style={styles.postLinkItem}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => isValidUrl(link) && Linking.openURL(link)}
                      >
                        <Text style={styles.postLinkIcon}>🔗</Text>
                        <Text style={styles.postLinkText} numberOfLines={1}>{link}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ marginLeft: 8 }}
                        onPress={() => {
                          if (isValidUrl(link)) {
                            Alert.alert('Link copied', link);
                          }
                        }}
                      >
                        <Text style={{ fontSize: 14, color: '#4A90E2' }}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              
              <View style={styles.postActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>🤍</Text>
                  <Text style={styles.actionCount}>{announcement.likes || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>💬</Text>
                  <Text style={styles.actionCount}>{announcement.comments || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionIcon}>📤</Text>
                  <Text style={styles.actionText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Announcement Modal */}
      <Modal
        visible={showCreateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Announcement</Text>
              <TouchableOpacity onPress={() => {
                setShowCreateModal(false);
                setNewAnnouncement({
                  title: '',
                  message: '',
                  targetType: 'campus',
                  targetClassId: null,
                  targetClassName: '',
                  targetSection: null,
                  image: null,
                  files: [],
                  links: []
                });
                setSelectedTarget('campus');
                setSelectedClass(null);
                setSelectedSection(null);
              }}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Title */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Title *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Announcement title"
                  value={newAnnouncement.title}
                  onChangeText={(text) => setNewAnnouncement({...newAnnouncement, title: text})}
                />
              </View>

              {/* Message */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Message *</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Write your announcement..."
                  multiline
                  numberOfLines={4}
                  value={newAnnouncement.message}
                  onChangeText={(text) => setNewAnnouncement({...newAnnouncement, message: text})}
                />
              </View>

              {/* Attachments Section */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Attachments</Text>
                <View style={styles.attachmentButtons}>
                  <TouchableOpacity style={styles.attachmentButton} onPress={pickImage}>
                    <Text style={styles.attachmentIcon}>📷</Text>
                    <Text style={styles.attachmentButtonText}>Image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.attachmentButton} onPress={pickDocument}>
                    <Text style={styles.attachmentIcon}>📎</Text>
                    <Text style={styles.attachmentButtonText}>File</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.attachmentButton} onPress={addLink}>
                    <Text style={styles.attachmentIcon}>🔗</Text>
                    <Text style={styles.attachmentButtonText}>Link</Text>
                  </TouchableOpacity>
                </View>

                {/* Show selected image */}
                {newAnnouncement.image && (
                  <View style={styles.attachmentPreview}>
                    <Text style={styles.attachmentLabel}>Image:</Text>
                    <View style={styles.attachmentItem}>
                      <Image source={{ uri: newAnnouncement.image }} style={styles.imagePreview} />
                      <TouchableOpacity onPress={removeImage} style={styles.removeButton}>
                        <Text style={styles.removeButtonText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Show selected files */}
                {newAnnouncement.files.length > 0 && (
                  <View style={styles.attachmentPreview}>
                    <Text style={styles.attachmentLabel}>Files:</Text>
                    {newAnnouncement.files.map((file, index) => (
                      <View key={index} style={styles.attachmentItem}>
                        <View style={styles.fileInfo}>
                          <Text style={styles.fileName}>{file.name}</Text>
                          <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeFile(index)} style={styles.removeButton}>
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Show added links */}
                {newAnnouncement.links.length > 0 && (
                  <View style={styles.attachmentPreview}>
                    <Text style={styles.attachmentLabel}>Links:</Text>
                    {newAnnouncement.links.map((link, index) => (
                      <View key={index} style={styles.attachmentItem}>
                        <Text style={styles.linkText} numberOfLines={1}>{link}</Text>
                        <TouchableOpacity onPress={() => removeLink(index)} style={styles.removeButton}>
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Target Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target</Text>
                <View style={styles.targetButtons}>
                  <TouchableOpacity
                    style={[
                      styles.targetButton,
                      selectedTarget === 'campus' && styles.targetButtonActive
                    ]}
                    onPress={() => setSelectedTarget('campus')}
                    >
                      <Text style={[
                        styles.targetButtonText,
                        selectedTarget === 'campus' && styles.targetButtonTextActive
                      ]}>
                        🏫 Campus
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.targetButton,
                        selectedTarget === 'section' && styles.targetButtonActive
                      ]}
                      onPress={() => {
                        setSelectedTarget('section');
                        // Automatically open the target selection modal when section is selected
                        if (userClasses.length > 0) {
                          // Small delay to show the button press feedback before opening modal
                          setTimeout(() => {
                            setShowTargetModal(true);
                          }, 100);
                        } else {
                          Alert.alert(
                            'No Classes Found',
                            'You need to create a class first before making section announcements.',
                            [{ text: 'OK' }]
                          );
                          setSelectedTarget('campus'); // Revert to campus if no classes
                        }
                      }}
                    >
                      <Text style={[
                        styles.targetButtonText,
                        selectedTarget === 'section' && styles.targetButtonTextActive
                      ]}>
                        📚 Section
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

              {/* Section Selection */}
              {selectedTarget === 'section' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Select Class & Section *</Text>
                  <TouchableOpacity
                    style={styles.sectionSelector}
                    onPress={() => setShowTargetModal(true)}
                  >
                    <Text style={[
                      styles.sectionSelectorText,
                      (!selectedClass || !selectedSection) && styles.placeholderText
                    ]}>
                      {selectedClass && selectedSection 
                        ? `${selectedClass.name} - ${selectedSection}`
                        : 'Tap to select class and section'
                      }
                    </Text>
                    <Text style={styles.selectorArrow}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewAnnouncement({
                    title: '',
                    message: '',
                    targetType: 'campus',
                    targetClassId: null,
                    targetClassName: '',
                    targetSection: null
                  });
                  setSelectedTarget('campus');
                  setSelectedClass(null);
                  setSelectedSection(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.createButton,
                  (!newAnnouncement.title.trim() || !newAnnouncement.message.trim() || 
                   (selectedTarget === 'section' && (!selectedClass || !selectedSection))) 
                    && styles.createButtonDisabled
                ]}
                onPress={addAnnouncement}
                disabled={!newAnnouncement.title.trim() || !newAnnouncement.message.trim() || 
                         (selectedTarget === 'section' && (!selectedClass || !selectedSection))}
              >
                <Text style={styles.createButtonText}>
                  {selectedTarget === 'campus' ? 'Post to Campus' : 'Post to Section'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Class & Section Selection Modal */}
      <Modal
        visible={showTargetModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTargetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Class & Section</Text>
              <TouchableOpacity onPress={() => setShowTargetModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {userClasses.map((classItem) => (
                <View key={classItem.id} style={styles.classItem}>
                  <Text style={styles.className}>{classItem.name}</Text>
                  <Text style={styles.classSubject}>{classItem.subject}</Text>
                  
                  <View style={styles.sectionButtons}>
                    {/* Show the actual section from the class */}
                    <TouchableOpacity
                      style={[
                        styles.sectionButton,
                        selectedClass?.id === classItem.id && selectedSection === classItem.section && styles.sectionButtonActive
                      ]}
                      onPress={() => {
                        setSelectedClass(classItem);
                        setSelectedSection(classItem.section);
                        setShowTargetModal(false);
                      }}
                    >
                      <Text style={[
                        styles.sectionButtonText,
                        selectedClass?.id === classItem.id && selectedSection === classItem.section && styles.sectionButtonTextActive
                      ]}>
                        {classItem.section}
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Add "All Sections" option for the class */}
                    <TouchableOpacity
                      style={[
                        styles.sectionButton,
                        selectedClass?.id === classItem.id && selectedSection === 'All Sections' && styles.sectionButtonActive
                      ]}
                      onPress={() => {
                        setSelectedClass(classItem);
                        setSelectedSection('All Sections');
                        setShowTargetModal(false);
                      }}
                    >
                      <Text style={[
                        styles.sectionButtonText,
                        selectedClass?.id === classItem.id && selectedSection === 'All Sections' && styles.sectionButtonTextActive
                      ]}>
                        All Sections
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Announcement Menu Modal */}
      <Modal visible={showAnnouncementMenu} transparent={true} animationType="fade">
        <View style={styles.announcementMenuOverlay}>
          <View style={styles.announcementMenuModal}>
            <View style={styles.announcementMenuHeader}>
              <Text style={styles.announcementMenuTitle}>Post Options</Text>
              <TouchableOpacity onPress={closeAnnouncementMenu}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {/* Edit option */}
            {selectedAnnouncement && selectedAnnouncement.professorId === currentUser?.uid && (
              <TouchableOpacity 
                style={styles.announcementMenuOption} 
                onPress={openEditAnnouncementModal}
              >
                <Text style={styles.announcementMenuOptionIcon}>✏️</Text>
                <Text style={styles.announcementMenuOptionText}>Edit Post</Text>
              </TouchableOpacity>
            )}
            
            {/* Delete option */}
            {selectedAnnouncement && selectedAnnouncement.professorId === currentUser?.uid && (
              <TouchableOpacity 
                style={styles.announcementMenuOption} 
                onPress={() => {
                  Alert.alert(
                    'Delete Announcement',
                    'Are you sure you want to delete this announcement? This action cannot be undone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: deleteAnnouncement }
                    ]
                  );
                }}
              >
                <Text style={styles.deleteMenuOptionIcon}>🗑️</Text>
                <Text style={styles.deleteMenuOptionText}>Delete Post</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Announcement Modal - copied from HomeScreen */}
      <Modal visible={showEditAnnouncementModal} transparent={true} animationType="slide">
        <View style={styles.newPostOverlay}>
          <View style={styles.newPostModal}>
            <View style={styles.newPostHeader}>
              <Text style={styles.newPostTitle}>Edit Post</Text>
              <TouchableOpacity onPress={closeEditAnnouncementModal}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.newPostContent}>
              <View style={styles.newPostAuthor}>
                {currentUser?.photoURL ? (
                  <Image source={{ uri: currentUser.photoURL }} style={styles.postAvatar} />
                ) : (
                  <View style={styles.profileIcon}>
                    <Text style={styles.profileIconText}>
                      {currentUser?.displayName?.charAt(0)?.toUpperCase() || currentUser?.email?.charAt(0)?.toUpperCase() || '👨‍🏫'}
                    </Text>
                  </View>
                )}
                <View style={styles.profileTextContainer}>
                  <Text style={styles.authorName}>
                    {currentUser?.displayName || currentUser?.email || 'You'}
                  </Text>
                  <Text style={styles.instructorTag}>
                    INSTRUCTOR
                  </Text>
                </View>
                <View style={styles.audienceInProfile}>
                  <Text style={styles.audienceProfileText}>Public</Text>
                  <Text style={styles.audienceProfileArrow}>▼</Text>
                </View>
              </View>

              <TextInput
                style={styles.newPostTextInput}
                placeholder="Edit your announcement..."
                placeholderTextColor="#888"
                multiline={true}
                value={editPostText}
                onChangeText={setEditPostText}
                textAlignVertical="top"
              />

              {/* Media Preview */}
              {editSelectedImages.length > 0 && (
                <View style={styles.mediaPreview}>
                  <Text style={styles.mediaPreviewLabel}>Images ({editSelectedImages.length}):</Text>
                  {editSelectedImages.map((image, index) => (
                    <View key={index} style={styles.mediaPreviewItem}>
                      <Image source={{ uri: image.uri }} style={styles.previewThumbnail} />
                      <View style={styles.mediaPreviewInfo}>
                        <Text style={styles.mediaPreviewText} numberOfLines={1}>{image.name}</Text>
                        <Text style={styles.mediaPreviewSize}>{formatFileSize(image.size)}</Text>
                      </View>
                      <TouchableOpacity 
                        onPress={() => setEditSelectedImages(prev => prev.filter((_, i) => i !== index))}
                        style={styles.removeMediaButtonContainer}
                      >
                        <Text style={styles.removeMediaButton}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {editSelectedFiles.length > 0 && (
                <View style={styles.mediaPreview}>
                  <Text style={styles.mediaPreviewLabel}>Files ({editSelectedFiles.length}):</Text>
                  {editSelectedFiles.map((file, index) => (
                    <View key={index} style={styles.mediaPreviewItem}>
                      <View style={styles.fileIconContainer}>
                        <Text style={styles.filePreviewIcon}>📎</Text>
                      </View>
                      <View style={styles.mediaPreviewInfo}>
                        <Text style={styles.mediaPreviewText} numberOfLines={1}>{file.name}</Text>
                        <Text style={styles.mediaPreviewSize}>{formatFileSize(file.size)}</Text>
                      </View>
                      <TouchableOpacity 
                        onPress={() => setEditSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                        style={styles.removeMediaButtonContainer}
                      >
                        <Text style={styles.removeMediaButton}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.newPostActions}>
              <View style={styles.mediaButtons}>
                <TouchableOpacity style={styles.mediaButton} onPress={handleEditCameraPicker}>
                  <Text style={styles.mediaButtonIcon}>📷</Text>
                  <Text style={styles.mediaButtonText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaButton} onPress={handleEditImagePicker}>
                  <Text style={styles.mediaButtonIcon}>🖼️</Text>
                  <Text style={styles.mediaButtonText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaButton} onPress={handleEditFilePicker}>
                  <Text style={styles.mediaButtonIcon}>📎</Text>
                  <Text style={styles.mediaButtonText}>File</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity style={styles.submitPostButton} onPress={() => {
                console.log('Update button pressed, current state:', {
                  editAnnouncement,
                  editSelectedImages,
                  editSelectedFiles,
                  selectedAnnouncement
                });
                updateAnnouncement();
              }}>
                <Text style={styles.submitPostButtonText}>Update</Text>
              </TouchableOpacity>
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
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  announcementCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  postCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  postInfo: {
    flex: 1,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  authorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  roleTag: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  instructorTag: {
    backgroundColor: '#FFF3E0',
    color: '#E75C1A',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  audienceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  audienceIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  audienceText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  postText: {
    fontSize: 18,
    color: '#444',
    lineHeight: 20,
    marginBottom: 12,
    marginLeft: 10,
    marginRight: 10,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    paddingBottom: 4,
    marginLeft: 10,
    marginRight: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  announcementTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    marginLeft: 10,
    marginRight: 10,
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
  timestamp: {
    fontSize: 13,
    color: '#888',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  actionIcon: {
    fontSize: 18,
    color: '#666',
  },
  actionCount: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  actionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  addAnnouncementContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  targetSelectionContainer: {
    marginBottom: 16,
  },
  targetLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  targetButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  targetButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
  },
  targetButtonActive: {
    backgroundColor: '#E75C1A',
    borderColor: '#E75C1A',
  },
  targetButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  targetButtonTextActive: {
    color: '#fff',
  },
  sectionSelectionContainer: {
    marginBottom: 16,
  },
  sectionSelector: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f8f8f8',
  },
  sectionSelectorLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  sectionSelectorValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  input: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  postButton: {
    backgroundColor: '#E75C1A',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  postButtonDisabled: {
    backgroundColor: '#ccc',
  },
  postButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  targetIndicator: {
    marginTop: 4,
  },
  targetBadge: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  campusBadge: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
  },
  sectionBadge: {
    backgroundColor: '#f3e5f5',
    color: '#7b1fa2',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    fontSize: 20,
    color: '#666',
    padding: 4,
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    backgroundColor: '#f8f8f8',
  },
  sectionSelectorText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  placeholderText: {
    color: '#999',
  },
  selectorArrow: {
    fontSize: 16,
    color: '#999',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f8f8',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  createButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    backgroundColor: '#E75C1A',
    flex: 1,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  classItem: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  classSubject: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  sectionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f8f8',
  },
  sectionButtonActive: {
    backgroundColor: '#E75C1A',
    borderColor: '#E75C1A',
  },
  sectionButtonText: {
    fontSize: 14,
    color: '#666',
  },
  sectionButtonTextActive: {
    color: '#fff',
  },
  attachmentButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  attachmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f8f8',
    gap: 4,
  },
  attachmentIcon: {
    fontSize: 16,
  },
  attachmentButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  attachmentPreview: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  attachmentLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  imagePreview: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 12,
    color: '#666',
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  postFiles: {
    marginBottom: 12,
  },
  postFilesLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  postFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
  },
  postFileIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  postFileInfo: {
    flex: 1,
  },
  postFileName: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  postFileSize: {
    fontSize: 10,
    color: '#666',
  },
  moreFilesText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  postLinks: {
    marginBottom: 12,
  },
  postLinksLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  postLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
  },
  postLinkIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  postLinkText: {
    flex: 1,
    fontSize: 12,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  // Announcement menu styles
  announcementMenuButton: {
    padding: 8,
  },
  announcementMenuIcon: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  announcementMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementMenuModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 200,
    maxWidth: 250,
    padding: 0,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  announcementMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  announcementMenuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  announcementMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  announcementMenuOptionIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 20,
  },
  announcementMenuOptionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '400',
  },
  deleteMenuOptionIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 20,
  },
  deleteMenuOptionText: {
    fontSize: 16,
    color: '#ff4444',
    fontWeight: '400',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  // New Post Modal Styles (copied from HomeScreen)
  newPostOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  newPostModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    maxHeight: '90%',
    minHeight: '55%',
    marginBottom: 40,
    marginLeft: 20,
    marginRight: 20,
  },
  newPostHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#042175',
  },
  newPostTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  newPostContent: {
    flex: 1,
    padding: 16,
  },
  newPostAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  profileTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  audienceInProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  audienceProfileText: {
    fontSize: 14,
    color: '#666',
    marginRight: 4,
  },
  audienceProfileArrow: {
    fontSize: 12,
    color: '#666',
  },
  newPostTextInput: {
    fontSize: 16,
    color: '#333',
    minHeight: 100,
    textAlignVertical: 'top',
    padding: 0,
    marginBottom: 16,
  },
  mediaPreview: {
    marginBottom: 16,
  },
  mediaPreviewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  mediaPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  previewThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
    resizeMode: 'cover',
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
    marginRight: 12,
  },
  filePreviewIcon: {
    fontSize: 20,
  },
  mediaPreviewInfo: {
    flex: 1,
  },
  mediaPreviewText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 2,
  },
  mediaPreviewSize: {
    fontSize: 12,
    color: '#666',
  },
  removeMediaButtonContainer: {
    padding: 4,
    marginLeft: 8,
  },
  removeMediaButton: {
    fontSize: 16,
    color: '#ff4444',
    fontWeight: 'bold',
  },
  newPostActions: {
    borderTopWidth: 2,
    borderTopColor: '#042175',
    padding: 16,
    backgroundColor: '#ffeee0',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  mediaButtons: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
    flexWrap: 'wrap',
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flex: 1,
    minWidth: 80,
    justifyContent: 'center',
  },
  mediaButtonIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  mediaButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  submitPostButton: {
    backgroundColor: '#E75C1A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitPostButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  postAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
});
