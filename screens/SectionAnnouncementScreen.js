import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  Modal, 
  Alert, 
  RefreshControl, 
  Image, 
  Linking,
  Share,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp, 
  deleteDoc, 
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  orderBy
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

export default function SectionAnnouncementScreen() {
  const navigation = useNavigation();
  const [rawAnnouncements, setRawAnnouncements] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userClasses, setUserClasses] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Comments Modal State
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  
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
  const [editPostText, setEditPostText] = useState('');
  const [editSelectedImages, setEditSelectedImages] = useState([]);
  const [editSelectedFiles, setEditSelectedFiles] = useState([]);
  const [editingPost, setEditingPost] = useState(null);

  const announcementsCollectionRef = db ? collection(db, 'sectionAnnouncements') : null;

  // Filter announcements based on user's classes
  const announcements = useMemo(() => {
    if (!rawAnnouncements.length) return [];
    
    return rawAnnouncements.filter(announcement => {
      if (announcement.targetType === 'campus') return true;
      if (announcement.targetType === 'section') {
        return userClasses.some(userClass => 
          userClass.id === announcement.targetClassId
        );
      }
      return true;
    });
  }, [rawAnnouncements, userClasses]);

  const [isLoading, setIsLoading] = useState(true);

  // Auth & Data Fetching
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

  useEffect(() => {
    if (!currentUser || !userRole || !announcementsCollectionRef) return;

    const unsubscribe = onSnapshot(announcementsCollectionRef, (snapshot) => {
      try {
        const fetchedAnnouncements = snapshot.docs.map((doc) => ({ 
          ...doc.data(), 
          id: doc.id 
        }));
        
        fetchedAnnouncements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setRawAnnouncements(fetchedAnnouncements);
      } catch (error) {
        console.error('Error processing real-time update:', error);
      }
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [currentUser?.uid, userRole]);

  // Comment Listener
  useEffect(() => {
    let unsubscribeComments;
    
    if (showCommentsModal && activeAnnouncement && db) {
      setLoadingComments(true);
      const commentsRef = collection(db, 'sectionAnnouncements', activeAnnouncement.id, 'comments');
      const q = query(commentsRef, orderBy('createdAt', 'desc'));
      
      unsubscribeComments = onSnapshot(q, (snapshot) => {
        const fetchedComments = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setComments(fetchedComments);
        setLoadingComments(false);
      });
    }

    return () => {
      if (unsubscribeComments) unsubscribeComments();
    };
  }, [showCommentsModal, activeAnnouncement]);

  const fetchUserRole = async (user) => {
    if (user && db) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          setUserRole(role);
          return role;
        }
      } catch (error) { console.error(error); }
    }
    return 'student';
  };

  const fetchUserClasses = async (user) => {
    if (user && db) {
      try {
        const classesCollection = collection(db, 'classes');
        const q = query(classesCollection, where('createdBy', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const classes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserClasses(classes);
      } catch (error) { console.error(error); }
    }
  };

  const fetchUserEnrolledClasses = async (user) => {
    if (user && db) {
      try {
        const classesCollection = collection(db, 'classes');
        const q = query(classesCollection, where('students', 'array-contains', user.uid));
        const querySnapshot = await getDocs(q);
        const classes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserClasses(classes);
      } catch (error) { console.error(error); }
    }
  };

  // --- ACTIONS ---

  const handleLike = async (announcement) => {
    if (!currentUser || !db) return;
    const announcementRef = doc(db, 'sectionAnnouncements', announcement.id);
    const isLiked = announcement.likedBy?.includes(currentUser.uid);
    
    try {
      if (isLiked) {
        await updateDoc(announcementRef, { likes: increment(-1), likedBy: arrayRemove(currentUser.uid) });
      } else {
        await updateDoc(announcementRef, { likes: increment(1), likedBy: arrayUnion(currentUser.uid) });
      }
    } catch (error) { Alert.alert("Error", "Could not update like status."); }
  };

  const handleShare = async (announcement) => {
    try {
      await Share.share({
        message: `${announcement.title}\n\n${announcement.message}\n\nShared via School App`,
        title: announcement.title,
      });
    } catch (error) { console.error(error.message); }
  };

  const openComments = (announcement) => {
    setActiveAnnouncement(announcement);
    setShowCommentsModal(true);
  };

  const handleSendComment = async () => {
    if (!newComment.trim() || !currentUser || !activeAnnouncement) return;

    try {
      const commentsRef = collection(db, 'sectionAnnouncements', activeAnnouncement.id, 'comments');
      await addDoc(commentsRef, {
        text: newComment.trim(),
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email.split('@')[0],
        userAvatar: currentUser.photoURL || null,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'sectionAnnouncements', activeAnnouncement.id), { comments: increment(1) });
      setNewComment('');
    } catch (error) { Alert.alert("Error", "Failed to send comment"); }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  // File/Image Pickers
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 1 });
    if (!result.canceled) setNewAnnouncement(p => ({ ...p, image: result.assets[0].uri }));
  };
  
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (!result.canceled) {
      const newFiles = result.assets.map(f => ({ name: f.name, uri: f.uri, size: f.size, type: f.mimeType }));
      setNewAnnouncement(p => ({ ...p, files: [...p.files, ...newFiles] }));
    }
  };
  
  const addLink = () => {
    Alert.prompt('Add Link', 'Enter URL:', [{ text: 'Cancel', style: 'cancel' }, { text: 'Add', onPress: url => {
      if (url?.trim()) setNewAnnouncement(p => ({ ...p, links: [...p.links, url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`] }));
    }}]);
  };
  
  const removeImage = () => setNewAnnouncement(p => ({ ...p, image: null }));
  const removeFile = (i) => setNewAnnouncement(p => ({ ...p, files: p.files.filter((_, idx) => idx !== i) }));

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // --- CRUD OPERATIONS WITH SYNC ---

  const addAnnouncement = async () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.message.trim()) {
      Alert.alert('Error', 'Please fill in title and message');
      return;
    }
    if (selectedTarget === 'section' && (!selectedClass || !selectedSection)) {
      Alert.alert('Error', 'Please select a class and section');
      return;
    }

    try {
      const announcementData = {
        title: newAnnouncement.title.trim(),
        message: newAnnouncement.message.trim(),
        professor: currentUser?.displayName || currentUser?.email || 'Instructor',
        professorId: currentUser.uid,
        createdBy: currentUser.uid,
        timestamp: new Date().toISOString(),
        createdAt: new Date(),
        likes: 0,
        likedBy: [],
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

      const docRef = await addDoc(announcementsCollectionRef, announcementData);
      
      const classWallData = {
        author: currentUser?.displayName || currentUser?.email || 'Instructor',
        authorId: currentUser.uid,
        authorAvatar: currentUser?.photoURL || null,
        role: 'Instructor',
        message: `${announcementData.title}\n\n${announcementData.message}`,
        audience: selectedTarget === 'campus' ? 'Public' : 'Class',
        selectedSections: selectedTarget === 'section' ? [{ 
          id: selectedClass.id, 
          name: selectedClass.name, 
          section: selectedSection 
        }] : [],
        likes: 0,
        comments: 0,
        image: announcementData.image,
        files: announcementData.files,
        isAnnouncement: true,
        originalAnnouncementData: { ...announcementData, id: docRef.id },
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'classWall'), classWallData);

      setNewAnnouncement({ title: '', message: '', targetType: 'campus', targetClassId: null, targetClassName: '', targetSection: null, image: null, files: [], links: [] });
      setSelectedTarget('campus');
      setShowCreateModal(false);
      Alert.alert('Success', 'Announcement posted!');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to post');
    }
  };

  // --- FIXED DELETE FUNCTION ---
  const deleteAnnouncement = async () => {
    if (!selectedAnnouncement) {
        Alert.alert('Error', 'No announcement selected');
        return;
    }

    console.log("Starting deletion for:", selectedAnnouncement.id);

    try {
      // 1. Delete from sectionAnnouncements (Main Data)
      const announcementRef = doc(db, 'sectionAnnouncements', selectedAnnouncement.id);
      await deleteDoc(announcementRef);
      console.log("Deleted from sectionAnnouncements");

      // 2. Sync Delete from classWall (Home Screen Copy)
      // We must query for copies and delete them individually
      const classWallQuery = query(
        collection(db, 'classWall'), 
        where('originalAnnouncementData.id', '==', selectedAnnouncement.id)
      );
      
      const snapshot = await getDocs(classWallQuery);
      
      // Use Promise.all to ensure all deletions complete properly
      const deletePromises = snapshot.docs.map(docSnapshot => deleteDoc(docSnapshot.ref));
      await Promise.all(deletePromises);
      console.log("Deleted copies from classWall");

      // 3. UI Cleanup
      setShowAnnouncementMenu(false);
      setSelectedAnnouncement(null);
      Alert.alert('Success', 'Announcement deleted successfully');

    } catch (e) { 
        console.error("Delete failed:", e);
        Alert.alert('Error', 'Failed to delete: ' + e.message); 
    }
  };

  const updateAnnouncement = async () => {
    if (!editingPost) return;
    try {
        const lines = editPostText.split('\n');
        const title = lines[0] || '';
        const message = lines.slice(1).join('\n').trim();

        const updatedData = {
            title: title,
            message: message,
            image: editSelectedImages[0]?.uri || null,
            files: editSelectedFiles,
            updatedAt: serverTimestamp()
        };

        await updateDoc(doc(db, 'sectionAnnouncements', editingPost.id), updatedData);

        const classWallQuery = query(
            collection(db, 'classWall'), 
            where('originalAnnouncementData.id', '==', editingPost.id)
        );
        const snapshot = await getDocs(classWallQuery);
        
        const classWallUpdate = {
            message: `${title}\n\n${message}`,
            image: updatedData.image,
            files: updatedData.files,
            'originalAnnouncementData.title': title,
            'originalAnnouncementData.message': message,
            'originalAnnouncementData.image': updatedData.image,
            'originalAnnouncementData.files': updatedData.files,
            updatedAt: serverTimestamp()
        };

        // Use Promise.all for updates too
        const updatePromises = snapshot.docs.map(d => updateDoc(d.ref, classWallUpdate));
        await Promise.all(updatePromises);

        setShowEditAnnouncementModal(false);
        Alert.alert('Success', 'Updated');
    } catch(e) { 
        console.error(e);
        Alert.alert('Error', 'Failed to update'); 
    }
  };

  const openEditModal = () => {
      setEditingPost(selectedAnnouncement);
      setEditPostText(`${selectedAnnouncement.title}\n${selectedAnnouncement.message}`);
      setEditSelectedImages(selectedAnnouncement.image ? [{uri: selectedAnnouncement.image}] : []);
      setEditSelectedFiles(selectedAnnouncement.files || []);
      setShowEditAnnouncementModal(true);
      setShowAnnouncementMenu(false);
  }

  const renderAnnouncement = (announcement) => {
    const isLiked = announcement.likedBy?.includes(currentUser?.uid);

    return (
      <View key={announcement.id} style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.profileIcon}>
             <Ionicons name="person" size={20} color="#fff" />
          </View>
          <View style={styles.postInfo}>
            <View style={styles.authorRow}>
              <Text style={styles.authorName}>{announcement.professor}</Text>
              <Text style={[styles.roleTag, styles.instructorTag]}>Instructor</Text>
            </View>
            <View style={styles.timestampRow}>
              <Text style={styles.timestamp}>
                {new Date(announcement.timestamp).toLocaleDateString()} • {new Date(announcement.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </Text>
              <View style={styles.audienceIndicator}>
                <Ionicons 
                    name={announcement.targetType === 'campus' ? "school-outline" : "library-outline"} 
                    size={12} 
                    color="#666" 
                    style={{marginRight: 4}}
                />
                <Text style={styles.audienceText}>
                  {announcement.targetType === 'campus' ? 'Campus' : `${announcement.targetClassName} - ${announcement.targetSection}`}
                </Text>
              </View>
            </View>
          </View>
          {currentUser?.uid === announcement.professorId && (
            <TouchableOpacity onPress={() => { setSelectedAnnouncement(announcement); setShowAnnouncementMenu(true); }}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
        
        {announcement.title && <Text style={styles.announcementTitle}>{announcement.title}</Text>}
        <Text style={styles.postText}>{announcement.message}</Text>
        {announcement.image && <Image source={{ uri: announcement.image }} style={styles.postImage} />}
        
        {/* Files */}
        {announcement.files?.map((file, i) => (
          <TouchableOpacity key={i} style={styles.postFileItem} onPress={() => Linking.openURL(file.uri)}>
            <Ionicons name="document-attach-outline" size={20} color="#666" style={{marginRight: 8}} />
            <View style={{flex: 1}}>
                <Text style={styles.postFileName} numberOfLines={1}>{file.name}</Text>
                <Text style={styles.postFileSize}>{formatFileSize(file.size)}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Links */}
        {announcement.links?.map((link, i) => (
            <TouchableOpacity key={i} style={styles.postLinkItem} onPress={() => Linking.openURL(link)}>
                <Ionicons name="link-outline" size={20} color="#007AFF" style={{marginRight: 8}} />
                <Text style={styles.postLinkText} numberOfLines={1}>{link}</Text>
            </TouchableOpacity>
        ))}

        {/* Action Buttons */}
        <View style={styles.postActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(announcement)}>
            <Ionicons 
                name={isLiked ? "heart" : "heart-outline"} 
                size={22} 
                color={isLiked ? "#E75C1A" : "#666"} 
            />
            <Text style={[styles.actionCount, isLiked && {color: '#E75C1A'}]}>
                {announcement.likes || 0}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={() => openComments(announcement)}>
            <Ionicons name="chatbubble-outline" size={22} color="#666" />
            <Text style={styles.actionCount}>{announcement.comments || 0}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(announcement)}>
            <Ionicons name="share-social-outline" size={22} color="#666" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Announcements</Text>
        {userRole === 'instructor' ? (
          <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add" size={28} color="#E75C1A" />
          </TouchableOpacity>
        ) : <View style={{width: 36}} />}
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#E75C1A']} />}
      >
        {isLoading ? (
            <ActivityIndicator size="large" color="#E75C1A" style={{marginTop: 40}} />
        ) : announcements.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="megaphone-outline" size={64} color="#ccc" />
            <Text style={styles.emptyStateTitle}>No announcements yet</Text>
          </View>
        ) : (
          announcements.map(renderAnnouncement)
        )}
        <View style={{height: 40}} />
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>New Announcement</Text>
                    <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                        <Ionicons name="close" size={24} color="#666" />
                    </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalBody}>
                    <Text style={styles.inputLabel}>Title</Text>
                    <TextInput 
                        style={styles.textInput} 
                        placeholder="Title" 
                        value={newAnnouncement.title}
                        onChangeText={t => setNewAnnouncement(p => ({...p, title: t}))}
                    />
                    
                    <Text style={styles.inputLabel}>Message</Text>
                    <TextInput 
                        style={[styles.textInput, styles.textArea]} 
                        placeholder="What's happening?" 
                        multiline 
                        value={newAnnouncement.message}
                        onChangeText={t => setNewAnnouncement(p => ({...p, message: t}))}
                    />

                    <View style={styles.attachmentButtons}>
                        <TouchableOpacity style={styles.attachmentButton} onPress={pickImage}>
                            <Ionicons name="image-outline" size={20} color="#666" />
                            <Text style={styles.attachmentButtonText}>Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.attachmentButton} onPress={pickDocument}>
                            <Ionicons name="document-text-outline" size={20} color="#666" />
                            <Text style={styles.attachmentButtonText}>File</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.attachmentButton} onPress={addLink}>
                            <Ionicons name="link-outline" size={20} color="#666" />
                            <Text style={styles.attachmentButtonText}>Link</Text>
                        </TouchableOpacity>
                    </View>

                    {newAnnouncement.image && (
                        <View style={styles.attachmentItem}>
                            <Image source={{uri: newAnnouncement.image}} style={styles.imagePreview} />
                            <TouchableOpacity onPress={removeImage}><Ionicons name="close-circle" size={24} color="#ff4444" /></TouchableOpacity>
                        </View>
                    )}
                    {newAnnouncement.files.map((f, i) => (
                        <View key={i} style={styles.attachmentItem}>
                            <Text style={{flex: 1}} numberOfLines={1}>{f.name}</Text>
                            <TouchableOpacity onPress={() => removeFile(i)}><Ionicons name="close-circle" size={20} color="#ff4444" /></TouchableOpacity>
                        </View>
                    ))}

                    <Text style={styles.inputLabel}>Audience</Text>
                    <View style={styles.targetButtons}>
                        <TouchableOpacity 
                            style={[styles.targetButton, selectedTarget === 'campus' && styles.targetButtonActive]}
                            onPress={() => setSelectedTarget('campus')}
                        >
                            <Text style={[styles.targetButtonText, selectedTarget === 'campus' && {color: '#fff'}]}>Campus</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.targetButton, selectedTarget === 'section' && styles.targetButtonActive]}
                            onPress={() => {
                                setSelectedTarget('section');
                                if (userClasses.length > 0) setShowTargetModal(true);
                                else Alert.alert('No Classes', 'Create a class first.');
                            }}
                        >
                            <Text style={[styles.targetButtonText, selectedTarget === 'section' && {color: '#fff'}]}>Section</Text>
                        </TouchableOpacity>
                    </View>
                    {selectedTarget === 'section' && (
                        <TouchableOpacity style={styles.sectionSelector} onPress={() => setShowTargetModal(true)}>
                            <Text style={styles.sectionSelectorText}>
                                {selectedClass ? `${selectedClass.name} - ${selectedSection}` : 'Select Class'}
                            </Text>
                            <Ionicons name="chevron-forward" size={20} color="#666" />
                        </TouchableOpacity>
                    )}
                </ScrollView>
                <View style={styles.modalFooter}>
                    <TouchableOpacity style={styles.createButton} onPress={addAnnouncement}>
                        <Text style={styles.createButtonText}>Post Announcement</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

      {/* Class Selection Modal */}
      <Modal visible={showTargetModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Section</Text>
                    <TouchableOpacity onPress={() => setShowTargetModal(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
                </View>
                <ScrollView style={styles.modalBody}>
                    {userClasses.map(cls => (
                        <View key={cls.id} style={styles.classItem}>
                            <Text style={styles.className}>{cls.name}</Text>
                            <View style={styles.sectionButtons}>
                                <TouchableOpacity 
                                    style={[styles.sectionButton, selectedClass?.id === cls.id && selectedSection === cls.section && styles.sectionButtonActive]}
                                    onPress={() => { setSelectedClass(cls); setSelectedSection(cls.section); setShowTargetModal(false); }}
                                >
                                    <Text style={[styles.sectionButtonText, selectedClass?.id === cls.id && selectedSection === cls.section && {color: '#fff'}]}>
                                        {cls.section}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            </View>
        </View>
      </Modal>

      {/* Options Menu Modal */}
      <Modal visible={showAnnouncementMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.announcementMenuOverlay} activeOpacity={1} onPress={() => setShowAnnouncementMenu(false)}>
            <View style={styles.announcementMenuModal}>
                <TouchableOpacity style={styles.announcementMenuOption} onPress={openEditModal}>
                    <Ionicons name="pencil-outline" size={20} color="#333" style={{marginRight: 12}} />
                    <Text>Edit Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.announcementMenuOption} onPress={() => {
                    Alert.alert('Delete', 'Are you sure?', [{text: 'Cancel'}, {text: 'Delete', style: 'destructive', onPress: deleteAnnouncement}]);
                }}>
                    <Ionicons name="trash-outline" size={20} color="#ff4444" style={{marginRight: 12}} />
                    <Text style={{color: '#ff4444'}}>Delete Post</Text>
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEditAnnouncementModal} animationType="slide">
         <View style={styles.container}>
             <View style={styles.header}>
                 <Text style={styles.title}>Edit Post</Text>
                 <TouchableOpacity onPress={() => setShowEditAnnouncementModal(false)}><Ionicons name="close" size={24} color="#fff"/></TouchableOpacity>
             </View>
             <TextInput 
                style={[styles.textInput, {margin: 20, height: 200, textAlignVertical: 'top'}]} 
                multiline 
                value={editPostText} 
                onChangeText={setEditPostText} 
             />
             <TouchableOpacity style={[styles.createButton, {margin: 20}]} onPress={updateAnnouncement}>
                 <Text style={styles.createButtonText}>Save Changes</Text>
             </TouchableOpacity>
         </View>
      </Modal>

      {/* Comments Modal */}
      <Modal visible={showCommentsModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
            <View style={styles.commentsContainer}>
                <View style={styles.commentsHeader}>
                    <Text style={styles.commentsTitle}>Comments</Text>
                    <TouchableOpacity onPress={() => setShowCommentsModal(false)}>
                        <Ionicons name="close" size={24} color="#666" />
                    </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.commentsList}>
                    {loadingComments ? (
                        <ActivityIndicator color="#E75C1A" style={{marginTop: 20}} />
                    ) : comments.length === 0 ? (
                        <Text style={{textAlign: 'center', marginTop: 40, color: '#999'}}>No comments yet. Be the first!</Text>
                    ) : (
                        comments.map(comment => (
                            <View key={comment.id} style={styles.commentItem}>
                                <View style={[styles.profileIcon, {width: 32, height: 32, marginRight: 10}]}>
                                    <Text style={{color: '#fff', fontSize: 14}}>{comment.userName?.charAt(0).toUpperCase()}</Text>
                                </View>
                                <View style={{flex: 1}}>
                                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                                        <Text style={styles.commentUser}>{comment.userName}</Text>
                                        <Text style={styles.commentTime}>
                                            {comment.createdAt ? new Date(comment.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                                        </Text>
                                    </View>
                                    <Text style={styles.commentText}>{comment.text}</Text>
                                </View>
                            </View>
                        ))
                    )}
                </ScrollView>

                <View style={styles.commentInputContainer}>
                    <TextInput 
                        style={styles.commentInput}
                        placeholder="Write a comment..."
                        value={newComment}
                        onChangeText={setNewComment}
                        multiline
                    />
                    <TouchableOpacity onPress={handleSendComment} disabled={!newComment.trim()}>
                        <Ionicons name="send" size={24} color={newComment.trim() ? "#E75C1A" : "#ccc"} />
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16,
    backgroundColor: '#E75C1A', elevation: 4
  },
  backButton: { padding: 8 },
  title: { fontSize: 20, fontWeight: '600', color: '#fff' },
  addButton: { width: 36, height: 36, backgroundColor: '#fff', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  
  content: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyStateTitle: { marginTop: 16, fontSize: 18, color: '#999' },

  postCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2 },
  postHeader: { flexDirection: 'row', marginBottom: 12 },
  profileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E75C1A', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  postInfo: { flex: 1 },
  authorName: { fontSize: 16, fontWeight: '600', color: '#333' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleTag: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  instructorTag: { backgroundColor: '#FFF3E0', color: '#E75C1A' },
  timestampRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  timestamp: { fontSize: 12, color: '#888' },
  audienceIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', paddingHorizontal: 6, borderRadius: 4 },
  audienceText: { fontSize: 10, color: '#666' },

  announcementTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6, color: '#222' },
  postText: { fontSize: 15, color: '#444', lineHeight: 22, marginBottom: 12 },
  postImage: { width: '100%', height: 200, borderRadius: 8, marginBottom: 12 },
  
  postFileItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, marginBottom: 6 },
  postFileName: { fontSize: 13, color: '#333', fontWeight: '500' },
  postFileSize: { fontSize: 11, color: '#888' },
  postLinkItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3F2FD', padding: 10, borderRadius: 8, marginBottom: 6 },
  postLinkText: { color: '#007AFF', textDecorationLine: 'underline', fontSize: 13 },

  postActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12, marginTop: 4, justifyContent: 'space-around' },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 },
  actionCount: { fontSize: 14, color: '#666', fontWeight: '500' },
  actionText: { fontSize: 14, color: '#666', fontWeight: '500' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#666', marginTop: 12, marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  
  attachmentButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  attachmentButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, backgroundColor: '#f8f8f8', borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  attachmentButtonText: { fontSize: 12, fontWeight: '500', color: '#555' },
  attachmentItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 6, marginTop: 8 },
  imagePreview: { width: 50, height: 50, borderRadius: 4, marginRight: 10 },

  targetButtons: { flexDirection: 'row', gap: 10 },
  targetButton: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#f0f0f0' },
  targetButtonActive: { backgroundColor: '#E75C1A' },
  targetButtonText: { color: '#666', fontWeight: '600' },
  sectionSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 10 },
  
  createButton: { backgroundColor: '#E75C1A', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  classItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  className: { fontSize: 16, fontWeight: '500', marginBottom: 8 },
  sectionButtons: { flexDirection: 'row', gap: 8 },
  sectionButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f0f0f0', borderRadius: 16 },
  sectionButtonActive: { backgroundColor: '#E75C1A' },
  sectionButtonText: { fontSize: 12, color: '#333' },

  announcementMenuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  announcementMenuModal: { backgroundColor: '#fff', borderRadius: 12, width: 200, padding: 8, elevation: 5 },
  announcementMenuOption: { flexDirection: 'row', alignItems: 'center', padding: 14 },

  // Comments Styles
  commentsContainer: { flex: 1, backgroundColor: '#fff', marginTop: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  commentsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  commentsTitle: { fontSize: 18, fontWeight: 'bold' },
  commentsList: { flex: 1, padding: 16 },
  commentItem: { flexDirection: 'row', marginBottom: 20 },
  commentUser: { fontWeight: 'bold', fontSize: 14, marginRight: 8 },
  commentTime: { fontSize: 12, color: '#999' },
  commentText: { fontSize: 14, color: '#333', marginTop: 2 },
  commentInputContainer: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingBottom: 30 },
  commentInput: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 10, maxHeight: 100 },
});