import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Image, Alert, TextInput, RefreshControl, Share } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, increment, serverTimestamp, onSnapshot, query, where } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export default function HomeScreen() {
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [classWallPosts, setClassWallPosts] = useState([]);
  
  // Post menu functionality
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  
  // New post modal functionality
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Audience selection functionality
  const [selectedAudience, setSelectedAudience] = useState('World'); // Default to World
  const [showAudienceModal, setShowAudienceModal] = useState(false);
  const [showSectionSelection, setShowSectionSelection] = useState(false);
  const [selectedSections, setSelectedSections] = useState([]);
  const [userEnrolledSections, setUserEnrolledSections] = useState([]); // User's enrolled sections from Firebase

  // Helper function to display audience text
  const getAudienceDisplayText = () => {
    if ((selectedAudience === 'Classmates' || selectedAudience === 'Class') && selectedSections.length > 0) {
      return `${selectedSections.length} Class${selectedSections.length > 1 ? 'es' : ''}`;
    }
    return selectedAudience;
  };
  
  // Fetch user's enrolled sections from Firebase classes
  const fetchUserEnrolledSections = async () => {
    if (!currentUser || !db) return;
    
    try {
      const classesCollection = collection(db, 'classes');
      let q;
      
      if (userRole === 'instructor') {
        // For instructors, get classes they created
        q = query(classesCollection, where('createdBy', '==', currentUser.uid));
      } else {
        // For students, get classes where they are enrolled
        q = query(classesCollection, where('students', 'array-contains', currentUser.uid));
      }
      
      const classesSnapshot = await getDocs(q);
      
      if (!classesSnapshot.empty) {
        // Extract class names and sections from classes
        const enrolledSections = classesSnapshot.docs.map(doc => {
          const data = doc.data();
          // Format as "Subject - Section" (e.g., "Programming - Section 1")
          return `${data.subject} - ${data.section}`;
        });
        
        setUserEnrolledSections(enrolledSections);
        console.log(`${userRole} sections:`, enrolledSections);
      } else {
        setUserEnrolledSections([]);
        console.log(`No classes found for ${userRole}`);
      }
    } catch (error) {
      console.error('Error fetching user enrolled sections:', error);
      setUserEnrolledSections([]);
    }
  };
  
  // Get filtered posts for display based on user's access and audience settings
  const getFilteredPosts = () => {
    return classWallPosts.filter(post => {
      // Filter posts based on audience setting
      if (!post.audience || post.audience === 'World') {
        return true; // Show all world posts (including campus announcements)
      }
      
      if (post.audience === 'Only Me') {
        // Only show "Only Me" posts to the author
        return post.authorId === currentUser?.uid;
      }
      
      if (post.audience === 'Classmates' || post.audience === 'Class') {
        // Always show posts authored by current user
        if (post.authorId === currentUser?.uid) {
          return true;
        }
        
        // For Class posts and announcements, check if user is enrolled in any of the selected classes
        if (!post.selectedSections || post.selectedSections.length === 0) {
          return true; // If no specific sections selected, show to all authenticated users
        }
        
        // Check if current user has access to any of the selected classes
        // For announcements, match by class ID and section
        if (post.isAnnouncement && post.selectedSections.length > 0) {
          return userEnrolledSections.some(userClass => 
            post.selectedSections.some(postSection => 
              userClass.id === postSection.id && userClass.section === postSection.section
            )
          );
        }
        
        // For regular class posts, use existing logic
        return userEnrolledSections.some(userClass => 
          post.selectedSections.includes(userClass)
        );
      }
      
      return true; // Default to showing the post
    });
  };
  
  // Comment functionality
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedPostForComment, setSelectedPostForComment] = useState(null);
  const [postComments, setPostComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  
  // Edit post functionality
  const [showEditPostModal, setShowEditPostModal] = useState(false);
  const [editPostText, setEditPostText] = useState('');
  const [editingPost, setEditingPost] = useState(null);
  const [editSelectedImages, setEditSelectedImages] = useState([]);
  const [editSelectedFiles, setEditSelectedFiles] = useState([]);
  
  const navigation = useNavigation();

  // Post menu functions
  const openPostMenu = (post) => {
    setSelectedPost(post);
    setShowPostMenu(true);
  };

  const closePostMenu = () => {
    setShowPostMenu(false);
    setSelectedPost(null);
  };

  const deletePost = async () => {
    if (!selectedPost) return;

    // Security check: Only allow deletion if user owns the post or is an instructor
    if (!isPostOwner(selectedPost) && userRole !== 'instructor') {
      Alert.alert('Error', 'You do not have permission to delete this post.');
      closePostMenu();
      return;
    }

    try {
      // Delete from Firestore if database is available
      if (db) {
        const postRef = doc(db, 'classWall', selectedPost.id);
        
        // Delete the post document (this includes all nested data like comments)
        await deleteDoc(postRef);
        
        console.log('Post deleted from Firestore:', selectedPost.id);
      }
      
      // Remove from local state
      setClassWallPosts(prevPosts => prevPosts.filter(post => post.id !== selectedPost.id));
      
      closePostMenu();
      Alert.alert('Success', 'Post and all related data deleted successfully');
      
      // Refresh posts to ensure sync
      if (db) {
        await fetchClassWallPosts();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      Alert.alert('Error', 'Failed to delete post. Please try again.');
    }
  };

  // Edit post functions
  const openEditPostModal = () => {
    if (!selectedPost) return;
    
    // Security check: Only allow editing if user owns the post
    if (!isPostOwner(selectedPost)) {
      Alert.alert('Error', 'You do not have permission to edit this post.');
      closePostMenu();
      return;
    }
    
    setEditingPost(selectedPost);
    setEditPostText(selectedPost.message || '');
    // Initialize with existing media if any
    setEditSelectedImages(selectedPost.image ? [{ uri: selectedPost.image, name: 'image.jpg', size: 0 }] : []);
    setEditSelectedFiles(selectedPost.files || []);
    // Set the current audience from the post
    setSelectedAudience(selectedPost.audience || 'World');
    // Set the selected sections if it's a classmates post
    setSelectedSections(selectedPost.selectedSections || []);
    setShowEditPostModal(true);
    closePostMenu();
  };

  const closeEditPostModal = () => {
    setShowEditPostModal(false);
    setEditingPost(null);
    setEditPostText('');
    setEditSelectedImages([]);
    setEditSelectedFiles([]);
  };

  const submitEditPost = async () => {
    if (!editingPost || (!editPostText.trim() && editSelectedImages.length === 0 && editSelectedFiles.length === 0)) {
      Alert.alert('Error', 'Please add some content to your post');
      return;
    }

    try {
      const updatedData = {
        message: editPostText,
        image: editSelectedImages.length > 0 ? editSelectedImages[0].uri : null,
        files: editSelectedFiles.map(file => ({
          name: file.name,
          size: file.size,
          type: file.type,
          uri: file.uri
        })),
        audience: selectedAudience,
        selectedSections: (selectedAudience === 'Classmates' || selectedAudience === 'Class') ? selectedSections : [], // Add selected sections for classmates/class
        updatedAt: serverTimestamp()
      };

      // Update in Firestore if database is available
      if (db) {
        await updateDoc(doc(db, 'classWall', editingPost.id), updatedData);
      }

      // Update local state
      setClassWallPosts(prevPosts => 
        prevPosts.map(post => 
          post.id === editingPost.id 
            ? { 
                ...post, 
                message: editPostText, 
                image: updatedData.image,
                files: updatedData.files,
                audience: selectedAudience,
                selectedSections: (selectedAudience === 'Classmates' || selectedAudience === 'Class') ? selectedSections : [],
                updatedAt: new Date() 
              }
            : post
        )
      );

      closeEditPostModal();
      Alert.alert('Success', 'Post updated successfully!');

      // Refresh posts to ensure sync
      if (db) {
        await fetchClassWallPosts();
      }
    } catch (error) {
      console.error('Error updating post:', error);
      Alert.alert('Error', 'Failed to update post');
    }
  };

  // Edit post media handlers
  const handleEditImagePicker = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to add images.');
        return;
      }

      // Launch image picker
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
          type: file.mimeType || 'application/octet-stream'
        };
        
        setEditSelectedFiles(prev => [...prev, fileData]);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  // Comment functions
  const openCommentModal = async (post) => {
    setSelectedPostForComment(post);
    setShowCommentModal(true);
    await fetchComments(post.id);
  };

  const closeCommentModal = () => {
    setShowCommentModal(false);
    setSelectedPostForComment(null);
    setPostComments([]);
    setNewComment('');
  };

  const fetchComments = async (postId) => {
    try {
      if (db) {
        const commentsCollection = collection(db, 'classWall', postId, 'comments');
        const commentsSnapshot = await getDocs(commentsCollection);
        const commentsData = commentsSnapshot.docs.map((doc, index) => {
          const data = doc.data();
          return {
            id: doc.id || `fetched-comment-${index}-${Date.now()}`,
            ...data,
            timestamp: data.createdAt && data.createdAt.seconds 
              ? new Date(data.createdAt.seconds * 1000).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })
              : 'Just now'
          };
        });
        
        // Sort comments by creation time (newest first)
        commentsData.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000);
          }
          return 0;
        });
        
        setPostComments(commentsData);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const submitComment = async () => {
    if (!newComment.trim() || !selectedPostForComment) {
      Alert.alert('Error', 'Please enter a comment');
      return;
    }

    try {
      // Get the latest user data including avatar
      let userAvatar = currentUser?.photoURL || null;
      
      // Try to get avatar from Firestore user document
      if (currentUser?.uid && db) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userAvatar = userData.photoURL || userData.avatar || currentUser?.photoURL || null;
          }
        } catch (error) {
          console.log('Could not fetch user avatar from Firestore:', error);
        }
      }
      
      const commentData = {
        author: currentUser?.displayName || currentUser?.email || 'You',
        authorId: currentUser?.uid || 'anonymous',
        authorAvatar: userAvatar,
        role: userRole === 'instructor' ? 'Instructor' : 'Student',
        message: newComment.trim(),
        createdAt: new Date()
      };

      let commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Update local state first with formatted timestamp
      const newCommentWithTimestamp = {
        ...commentData,
        id: commentId,
        timestamp: new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      };

      setPostComments(prev => [newCommentWithTimestamp, ...prev]);
      setNewComment('');

      // Update post comment count in local state
      setClassWallPosts(prevPosts => 
        prevPosts.map(p => 
          p.id === selectedPostForComment.id 
            ? { ...p, comments: (p.comments || 0) + 1 }
            : p
        ).filter((post, index, self) => 
          // Remove duplicates by ID
          index === self.findIndex(p => p.id === post.id)
        )
      );

      // Sync to Firebase
      if (db) {
        try {
          const firebaseCommentData = {
            ...commentData,
            createdAt: serverTimestamp()
          };
          
          const docRef = await addDoc(collection(db, 'classWall', selectedPostForComment.id, 'comments'), firebaseCommentData);
          
          // Update comment count on main post
          await updateDoc(doc(db, 'classWall', selectedPostForComment.id), {
            comments: increment(1)
          });
          
          console.log('Comment synced to Firebase successfully');
        } catch (firebaseError) {
          console.error('Firebase sync error:', firebaseError);
          
          // Check if it's a permissions error
          if (firebaseError.code === 'permission-denied') {
            Alert.alert(
              'Sync Warning', 
              'Comment added locally but not synced to server. Please check your permissions or contact support.',
              [{ text: 'OK' }]
            );
          } else {
            // For other Firebase errors, still keep the local comment
            console.log('Comment saved locally despite Firebase error');
          }
        }
      }

    } catch (error) {
      console.error('Error adding comment:', error);
      Alert.alert('Error', 'Failed to add comment. Please try again.');
    }
  };

  // Like functions
  const handleLikePost = async (post) => {
    try {
      const currentUserName = currentUser?.displayName || currentUser?.email || 'You';
      const currentUserId = currentUser?.uid;
      
      if (!currentUserId) {
        Alert.alert('Error', 'Please log in to like posts');
        return;
      }
      
      // Ensure likedBy is an array, default to empty array if undefined
      const likedByArray = Array.isArray(post.likedBy) ? post.likedBy : [];
      
      // Check if user already liked the post
      const userLiked = likedByArray.includes(currentUserId);
      
      // Update local state immediately for responsive UI
      setClassWallPosts(prevPosts => 
        prevPosts.map(p => 
          p.id === post.id 
            ? { 
                ...p, 
                likes: userLiked ? Math.max((p.likes || 1) - 1, 0) : (p.likes || 0) + 1,
                likedBy: userLiked 
                  ? likedByArray.filter(id => id !== currentUserId)
                  : [...likedByArray, currentUserId]
              }
            : p
        ).filter((post, index, self) => 
          // Remove duplicates by ID
          index === self.findIndex(p => p.id === post.id)
        )
      );

      // Sync to Firebase
      if (db) {
        try {
          const postRef = doc(db, 'classWall', post.id);
          
          if (userLiked) {
            // Unlike the post
            await updateDoc(postRef, {
              likes: increment(-1),
              likedBy: likedByArray.filter(id => id !== currentUserId)
            });
          } else {
            // Like the post
            await updateDoc(postRef, {
              likes: increment(1),
              likedBy: [...likedByArray, currentUserId]
            });
          }
          
          console.log('Like synced to Firebase successfully');
        } catch (firebaseError) {
          console.error('Firebase like sync error:', firebaseError);
          
          if (firebaseError.code === 'permission-denied') {
            Alert.alert(
              'Sync Warning', 
              'Like updated locally but not synced to server. Please check your permissions.',
              [{ text: 'OK' }]
            );
          }
        }
      }

    } catch (error) {
      console.error('Error updating like:', error);
      Alert.alert('Error', 'Failed to update like. Please try again.');
    }
  };

  // Share function
  const handleShare = async (post) => {
    try {
      let shareContent = `Check out this post by ${post.author} (${post.role}):\n\n"${post.message}"`;
      
      // Add timestamp info
      if (post.timestamp) {
        shareContent += `\n\nPosted: ${post.timestamp}`;
      }
      
      // Add attachments info if they exist
      if (post.files && post.files.length > 0) {
        shareContent += `\n\nAttachments: ${post.files.length} file(s)`;
        // List file names
        post.files.forEach((file, index) => {
          if (index < 3) { // Show first 3 files
            shareContent += `\n- ${file.name}`;
          }
        });
        if (post.files.length > 3) {
          shareContent += `\n- and ${post.files.length - 3} more...`;
        }
      }
      
      if (post.image) {
        shareContent += '\n\n📷 Includes an image';
      }
      
      shareContent += '\n\n📚 Shared from PATHFit Class Wall\n#PATHFit #ClassWall #Education';
      
      const shareOptions = {
        message: shareContent,
        title: `PATHFit Post by ${post.author}`,
      };

      // If there's an image, try to include it
      if (post.image) {
        shareOptions.url = post.image;
      }
      
      const result = await Share.share(shareOptions);

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          console.log('Shared via:', result.activityType);
          // You could track sharing analytics here
        } else {
          console.log('Post shared successfully');
        }
        
        // Optional: Show success message
        Alert.alert('Success', 'Post shared successfully!');
      } else if (result.action === Share.dismissedAction) {
        console.log('Share dismissed by user');
      }
    } catch (error) {
      console.error('Error sharing post:', error);
      Alert.alert('Error', 'Failed to share post. Please try again.');
    }
  };

  // Helper function to check if current user liked a post
  const isPostLiked = (post) => {
    const currentUserId = currentUser?.uid;
    return post.likedBy && Array.isArray(post.likedBy) && currentUserId && post.likedBy.includes(currentUserId);
  };

  // Check if current user owns the post
  const isPostOwner = (post) => {
    const currentUserId = currentUser?.uid;
    
    // Must have both post.authorId and currentUserId for ownership check
    if (!post.authorId || !currentUserId) {
      console.log('Ownership check failed: Missing authorId or currentUserId', {
        postAuthorId: post.authorId,
        currentUserId: currentUserId,
        postAuthor: post.author
      });
      return false;
    }
    
    // Primary check: Use authorId for accurate ownership verification
    const isOwner = post.authorId === currentUserId;
    
    console.log('Post ownership check:', {
      postId: post.id,
      postAuthor: post.author,
      postAuthorId: post.authorId,
      currentUserId: currentUserId,
      isOwner: isOwner
    });
    
    return isOwner;
  };

  // New post functions
  const openNewPostModal = async () => {
    // Refresh current user data to get latest avatar
    const user = auth.currentUser;
    if (user) {
      try {
        await user.reload();
        setCurrentUser({ ...user });
      } catch (error) {
        console.log('Could not refresh user data:', error);
      }
    }
    setShowNewPostModal(true);
  };

  const closeNewPostModal = () => {
    setShowNewPostModal(false);
    setNewPostText('');
    setSelectedImages([]);
    setSelectedFiles([]);
    setSelectedAudience('World'); // Reset to default
  };

  const handleImagePicker = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          type: asset.type || 'image/jpeg',
          size: asset.fileSize || 0
        }));
        
        setSelectedImages(prev => [...prev, ...newImages]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleCameraPicker = async () => {
    try {
      // Request camera permission
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera is required!');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newImage = {
          uri: result.assets[0].uri,
          name: `camera_${Date.now()}.jpg`,
          type: 'image/jpeg',
          size: result.assets[0].fileSize || 0
        };
        
        setSelectedImages(prev => [...prev, newImage]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleFilePicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        const newFiles = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size || 0
        }));
        
        setSelectedFiles(prev => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const submitNewPost = async () => {
    if (!newPostText.trim() && selectedImages.length === 0 && selectedFiles.length === 0) {
      Alert.alert('Error', 'Please add some content to your post');
      return;
    }

    try {
      // Get the latest user data including avatar
      let userAvatar = currentUser?.photoURL || null;
      
      // Try to get avatar from Firestore user document
      if (currentUser?.uid && db) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userAvatar = userData.photoURL || userData.avatar || currentUser?.photoURL || null;
          }
        } catch (error) {
          console.log('Could not fetch user avatar from Firestore:', error);
        }
      }
      
      // Create new post object
      const newPostData = {
        author: currentUser?.displayName || currentUser?.email || 'You',
        authorId: currentUser?.uid || 'anonymous',
        authorAvatar: userAvatar,
        role: userRole === 'instructor' ? 'Instructor' : 'Student',
        message: newPostText,
        audience: selectedAudience, // Add audience field
        selectedSections: (selectedAudience === 'Classmates' || selectedAudience === 'Class') ? selectedSections : [], // Add selected sections for classmates/class
        likes: 0,
        comments: 0,
        image: selectedImages.length > 0 ? selectedImages[0].uri : null,
        files: selectedFiles.map(file => ({
          name: file.name,
          size: file.size,
          type: file.type,
          uri: file.uri
        })),
        createdAt: serverTimestamp()
      };

      let newPostId;
      
      // Save to Firestore if database is available
      if (db) {
        const docRef = await addDoc(collection(db, 'classWall'), newPostData);
        newPostId = docRef.id;
      } else {
        newPostId = `local_post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Create post object for local state with formatted timestamp
      const newPost = {
        id: newPostId,
        ...newPostData,
        timestamp: new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      };

      // Add to local state with duplicate prevention
      setClassWallPosts(prevPosts => {
        // Check if post already exists
        const existingPostIndex = prevPosts.findIndex(p => p.id === newPostId);
        if (existingPostIndex !== -1) {
          // Replace existing post
          const updatedPosts = [...prevPosts];
          updatedPosts[existingPostIndex] = newPost;
          return updatedPosts;
        } else {
          // Add new post to beginning
          return [newPost, ...prevPosts];
        }
      });
      
      closeNewPostModal();
      Alert.alert('Success', 'Post created successfully!');
      
      // Refresh posts to ensure sync
      if (db) {
        await fetchClassWallPosts();
      }
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('Error', 'Failed to create post');
    }
  };

  // Fetch user role from Firestore
  const fetchUserRole = async (user) => {
    if (user && db) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    }
  };

  // Fetch ClassWall posts
  const fetchClassWallPosts = async () => {
    try {
      // Check if user is authenticated before fetching
      if (!auth.currentUser) {
        console.log('User not authenticated, skipping ClassWall fetch');
        setClassWallPosts([]);
        return;
      }

      if (db) {
        const postsCollection = collection(db, 'classWall');
        const postsSnapshot = await getDocs(postsCollection);
        const postsData = postsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Format timestamp for display
            timestamp: data.createdAt && data.createdAt.seconds 
              ? new Date(data.createdAt.seconds * 1000).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })
              : data.timestamp || 'Just now'
          };
        });
        
        // Sort posts by creation time (newest first)
        postsData.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000);
          }
          return 0;
        });
        
        setClassWallPosts(postsData); // Show all posts from Firebase
      } else {
        setClassWallPosts([]);
      }
    } catch (error) {
      console.error('Error fetching ClassWall posts:', error);
      setClassWallPosts([]);
    }
  };

  // Pull to refresh function
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchClassWallPosts();
    } catch (error) {
      console.error('Error refreshing posts:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Helper function to get file icon
  const getFileIcon = (fileName) => {
    const extension = fileName?.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf': return '📄';
      case 'doc':
      case 'docx': return '📝';
      case 'xls':
      case 'xlsx': return '📊';
      case 'ppt':
      case 'pptx': return '📺';
      case 'txt': return '📋';
      case 'zip':
      case 'rar': return '🗂️';
      default: return '📎';
    }
  };

  // Helper function to format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        fetchUserRole(user);
        fetchUserEnrolledSections(); // Fetch user's enrolled sections
      } else {
        setUserRole(null);
        setUserEnrolledSections([]); // Clear enrolled sections when user logs out
      }
    });
    
    // Set up real-time listener for ClassWall posts
    let unsubscribePosts = null;
    
    if (db) {
      const postsCollection = collection(db, 'classWall');
      unsubscribePosts = onSnapshot(postsCollection, (snapshot) => {
        // Check if user is still authenticated when snapshot arrives
        if (!auth.currentUser) {
          console.log('User not authenticated, skipping snapshot processing');
          return;
        }
        
        const postsData = snapshot.docs.map((doc, index) => {
          const data = doc.data();
          return {
            id: doc.id || `firebase-post-${index}-${Date.now()}`,
            ...data,
            // Format timestamp for display
            timestamp: data.createdAt && data.createdAt.seconds 
              ? new Date(data.createdAt.seconds * 1000).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })
              : data.timestamp || 'Just now'
          };
        });
        
        // Sort posts by creation time (newest first)
        postsData.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000);
          }
          return 0;
        });
        
        // Update state with duplicate prevention
        setClassWallPosts(prevPosts => {
          // Create a Map to track unique posts by ID
          const postMap = new Map();
          
          // Add existing local posts first (to preserve optimistic updates)
          prevPosts.forEach(post => {
            if (post.id && post.id.startsWith('local_post_')) {
              postMap.set(post.id, post);
            }
          });
          
          // Add/update Firebase posts
          postsData.forEach(post => {
            postMap.set(post.id, post);
          });
          
          // Convert back to array and sort
          const uniquePosts = Array.from(postMap.values());
          uniquePosts.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });
          
          return uniquePosts;
        });
      }, (error) => {
        console.error('Error listening to posts:', error);
        // Fallback to manual fetch
        fetchClassWallPosts();
      });
    } else {
      // Fetch ClassWall posts when component mounts and no database
      fetchClassWallPosts();
    }
    
    return () => {
      unsubscribe();
      if (unsubscribePosts) {
        unsubscribePosts();
      }
    };
  }, []);

  // Fetch user's enrolled sections when currentUser or userRole changes
  useEffect(() => {
    if (currentUser && userRole) {
      fetchUserEnrolledSections();
    }
  }, [currentUser, userRole]);

  // Refresh user data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const user = auth.currentUser;
      if (user) {
        user.reload().then(() => {
          setCurrentUser({ ...user });
          fetchUserRole(user);
        }).catch(() => {
          setCurrentUser({ ...user });
          fetchUserRole(user);
        });
      }
    }, [])
  );

  const handleSignOut = () => {
    signOut(auth).catch(error => alert(error.message));
  };

  const menuItems = [
    'Dashboard',
    'PATHclass',
    'Announcement',
    'My Events',
    'Attendance'
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
                  source={require('../assets/PATH.png')}
                  style={styles.logo}
                  resizeMode='contain'
                  accessibilityLabel="PATHFIT logo" />
        </View>
        <TouchableOpacity onPress={() => setShowSideMenu(true)} style={styles.menuButton}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* ClassWall Posts Preview */}
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
        
        {/* “What’s your PATHFit update today?” */}
        <TouchableOpacity 
          style={styles.whatsOnYourMindContainer}
          onPress={openNewPostModal}
        >
          <View style={styles.whatsOnYourMindContent}>
            {currentUser?.photoURL ? (
              <Image source={{ uri: currentUser.photoURL }} style={styles.userProfileAvatar} />
            ) : (
              <View style={[
                styles.userProfileIcon,
                userRole === 'instructor' ? styles.instructorIcon : styles.studentIcon
              ]}>
                <Text style={styles.userProfileIconText}>
                  {currentUser?.displayName?.charAt(0)?.toUpperCase() || currentUser?.email?.charAt(0)?.toUpperCase() || (userRole === 'instructor' ? '👨‍🏫' : '👤')}
                </Text>
              </View>
            )}
            <Text style={styles.whatsOnYourMindText}>“What’s your PATHFit update today?”</Text>
          </View>
        </TouchableOpacity>
        
        {getFilteredPosts().map((post, index) => (
          <View key={post.id || `post-${index}-${Date.now()}`} style={styles.postCard}>
            <View style={styles.postHeader}>
              {post.authorAvatar ? (
                <Image source={{ uri: post.authorAvatar }} style={styles.postAvatar} />
              ) : (
                <View style={[
                  styles.profileIcon,
                  post.role === 'Instructor' ? styles.instructorIcon : styles.studentIcon
                ]}>
                  <Text style={styles.profileIconText}>
                    {post.author?.charAt(0)?.toUpperCase() || (post.role === 'Instructor' ? '👨‍🏫' : '👤')}
                  </Text>
                </View>
              )}
              <View style={styles.postInfo}>
                {post.isAnnouncement && (
                  <View style={styles.announcementRow}>
                    <View style={styles.announcementBadge}>
                      <Text style={styles.announcementBadgeText}>📢 Announcement</Text>
                    </View>
                  </View>
                )}
                <View style={styles.authorRow}>
                  <Text style={styles.authorName}>{post.author}</Text>
                  <Text style={[
                    styles.roleTag,
                    post.role === 'Instructor' ? styles.instructorTag : styles.studentTag
                  ]}>
                    {post.role}
                  </Text>
                </View>
                <View style={styles.timestampRow}>
                  <Text style={styles.timestamp}>{post.timestamp}</Text>
                  {post.audience && (
                    <View style={styles.audienceIndicator}>
                      <Text style={styles.audienceIcon}>
                        {post.audience === 'World' ? '🌍' : 
                         (post.audience === 'Classmates' || post.audience === 'Class') ? '👥' : 
                         post.audience === 'Only Me' ? '🔒' : '🌍'}
                      </Text>
                      <Text style={styles.audienceText}>{post.audience}</Text>
                    </View>
                  )}
                </View>
              </View>
              {/* Only show menu button for posts owned by current user */}
              {currentUser?.uid && post.authorId && currentUser.uid === post.authorId && (
                <TouchableOpacity 
                  style={styles.postMenuButton}
                  onPress={() => openPostMenu(post)}
                >
                  <Text style={styles.postMenuIcon}>⋯</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <Text style={styles.postText}>{post.message}</Text>
            
            {/* Post Image */}
            {post.image && (
              <Image source={{ uri: post.image }} style={styles.postImage} />
            )}

            {/* Post Files */}
            {post.files && post.files.length > 0 && (
              <View style={styles.postFiles}>
                <Text style={styles.postFilesLabel}>Attachments:</Text>
                {post.files.slice(0, 2).map((file, index) => (
                  <View key={index} style={styles.postFileItem}>
                    <Text style={styles.postFileIcon}>{getFileIcon(file.name)}</Text>
                    <View style={styles.postFileInfo}>
                      <Text style={styles.postFileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.postFileSize}>{formatFileSize(file.size)}</Text>
                    </View>
                  </View>
                ))}
                {post.files.length > 2 && (
                  <Text style={styles.moreFilesText}>+{post.files.length - 2} more files</Text>
                )}
              </View>
            )}

            {/* Tagged Friends */}
            {post.taggedFriends && post.taggedFriends.length > 0 && (
              <View style={styles.postTaggedFriends}>
                <Text style={styles.postTaggedText}>
                  Tagged: {post.taggedFriends.map(friend => friend.name).join(', ')}
                </Text>
              </View>
            )}

            {/* Only show actions for non-announcement posts */}
            {!post.isAnnouncement && (
              <View style={styles.postActions}>
                <TouchableOpacity 
                  style={styles.actionButton} 
                  onPress={() => handleLikePost(post)}
                >
                   <Image
                    source={
                      isPostLiked(post)
                        ? require('../assets/HTA.png') // active like
                       : require('../assets/HTI.png')  // normal like
                   }  
                  style={styles.actionIconImage}
                />
                <Text style={styles.actionCount}>{post.likes || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => openCommentModal(post)}
                >
                  <Image
                    source={require('../assets/COI.png')}
                    style={styles.actionIconImage}

                  />
                  <Text style={styles.actionCount}>{post.comments || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => handleShare(post)}
                >
                 <Image
                    source={require('../assets/S.png')}
                    style={styles.actionIconImage}

                  />
                  <Text style={styles.actionText}>Share</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
        
        {getFilteredPosts().length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No posts yet. Be the first to share something!</Text>
            <TouchableOpacity 
              style={styles.goToClassWallButton}
              onPress={() => navigation.navigate('ClassWall')}
            >
              <Text style={styles.goToClassWallText}>Go to ClassWall</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* New Post Modal */}
      <Modal visible={showNewPostModal} transparent={true} animationType="slide">
        <View style={styles.newPostOverlay}>
          <View style={styles.newPostModal}>
            <View style={styles.newPostHeader}>
              <Text style={styles.newPostTitle}>Create Post</Text>
              <TouchableOpacity onPress={closeNewPostModal}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.newPostContent}>
              <View style={styles.newPostAuthor}>
                {currentUser?.photoURL ? (
                  <Image source={{ uri: currentUser.photoURL }} style={styles.postAvatar} />
                ) : (
                  <View style={[
                    styles.profileIcon,
                    userRole === 'instructor' ? styles.instructorIcon : styles.studentIcon
                  ]}>
                    <Text style={styles.profileIconText}>
                      {currentUser?.displayName?.charAt(0)?.toUpperCase() || currentUser?.email?.charAt(0)?.toUpperCase() || (userRole === 'instructor' ? '👨‍🏫' : '👤')}
                    </Text>
                  </View>
                )}
                <View style={styles.profileTextContainer}>
                  <Text style={styles.authorName}>
                    {currentUser?.displayName || currentUser?.email || 'You'}
                  </Text>
                  <Text style={[
                    styles.roleTag,
                    userRole === 'instructor' ? styles.instructorTag : styles.studentTag
                  ]}>
                    {userRole === 'instructor' ? 'Instructor' : 'Student'}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.audienceInProfile}
                  onPress={() => setShowAudienceModal(true)}
                >
                  <Text style={styles.audienceProfileText}>{getAudienceDisplayText()}</Text>
                  <Text style={styles.audienceProfileArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.newPostTextInput}
                placeholder="“What’s your PATHFit update today?”"
                placeholderTextColor="#888"
                multiline={true}
                value={newPostText}
                onChangeText={setNewPostText}
                textAlignVertical="top"
              />

              {/* Media Preview */}
              {selectedImages.length > 0 && (
                <View style={styles.mediaPreview}>
                  <Text style={styles.mediaPreviewLabel}>Images ({selectedImages.length}):</Text>
                  {selectedImages.map((image, index) => (
                    <View key={index} style={styles.mediaPreviewItem}>
                      <Image source={{ uri: image.uri }} style={styles.previewThumbnail} />
                      <View style={styles.mediaPreviewInfo}>
                        <Text style={styles.mediaPreviewText} numberOfLines={1}>{image.name}</Text>
                        <Text style={styles.mediaPreviewSize}>{formatFileSize(image.size)}</Text>
                      </View>
                      <TouchableOpacity 
                        onPress={() => setSelectedImages(prev => prev.filter((_, i) => i !== index))}
                        style={styles.removeMediaButtonContainer}
                      >
                        <Text style={styles.removeMediaButton}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {selectedFiles.length > 0 && (
                <View style={styles.mediaPreview}>
                  <Text style={styles.mediaPreviewLabel}>Files ({selectedFiles.length}):</Text>
                  {selectedFiles.map((file, index) => (
                    <View key={index} style={styles.mediaPreviewItem}>
                      <View style={styles.fileIconContainer}>
                        <Text style={styles.filePreviewIcon}>{getFileIcon(file.name)}</Text>
                      </View>
                      <View style={styles.mediaPreviewInfo}>
                        <Text style={styles.mediaPreviewText} numberOfLines={1}>{file.name}</Text>
                        <Text style={styles.mediaPreviewSize}>{formatFileSize(file.size)}</Text>
                      </View>
                      <TouchableOpacity 
                        onPress={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
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
                <TouchableOpacity style={styles.mediaButton} onPress={handleCameraPicker}>
                  <Text style={styles.mediaButtonIcon}>📷</Text>
                  <Text style={styles.mediaButtonText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaButton} onPress={handleImagePicker}>
                  <Text style={styles.mediaButtonIcon}>🖼️</Text>
                  <Text style={styles.mediaButtonText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaButton} onPress={handleFilePicker}>
                  <Text style={styles.mediaButtonIcon}>📎</Text>
                  <Text style={styles.mediaButtonText}>File</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity style={styles.submitPostButton} onPress={submitNewPost}>
                <Text style={styles.submitPostButtonText}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Post Menu Modal */}
      <Modal visible={showPostMenu} transparent={true} animationType="fade">
        <View style={styles.postMenuOverlay}>
          <View style={styles.postMenuModal}>
            <View style={styles.postMenuHeader}>
              <Text style={styles.postMenuTitle}>Post Options</Text>
              <TouchableOpacity onPress={closePostMenu}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {/* Only show Edit option if current user is the author */}
            {selectedPost && isPostOwner(selectedPost) && (
              <TouchableOpacity 
                style={styles.postMenuOption} 
                onPress={openEditPostModal}
              >
                <Text style={styles.postMenuOptionIcon}>✏️</Text>
                <Text style={styles.postMenuOptionText}>Edit Post</Text>
              </TouchableOpacity>
            )}
            
            {/* Only show Delete option if current user is the author or is an instructor */}
            {selectedPost && (isPostOwner(selectedPost) || userRole === 'instructor') && (
              <TouchableOpacity 
                style={[styles.postMenuOption, styles.deleteOption]} 
                onPress={() => {
                Alert.alert(
                  'Delete Post',
                  'Are you sure you want to delete this post? This action cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: deletePost }
                  ]
                );
              }}
            >
              <Text style={styles.postMenuOptionIcon}>🗑️</Text>
              <Text style={[styles.postMenuOptionText, styles.deleteOptionText]}>Delete Post</Text>
            </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Comment Modal */}
      <Modal visible={showCommentModal} transparent={true} animationType="slide">
        <View style={styles.commentModalOverlay}>
          <View style={styles.commentModal}>
            <View style={styles.commentModalHeader}>
              <Text style={styles.commentModalTitle}>
                Comments ({postComments.length})
              </Text>
              <TouchableOpacity onPress={closeCommentModal}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {/* Comments List */}
            <ScrollView style={styles.commentsContainer}>
              {postComments.length === 0 ? (
                <View style={styles.noCommentsContainer}>
                  <Text style={styles.noCommentsText}>No comments yet. Be the first to comment!</Text>
                </View>
              ) : (
                postComments.map((comment, index) => (
                  <View key={comment.id || `comment-${index}-${Date.now()}`} style={styles.commentItem}>
                    {comment.authorAvatar ? (
                      <Image source={{ uri: comment.authorAvatar }} style={styles.commentAvatar} />
                    ) : (
                      <View style={[
                        styles.commentProfileIcon,
                        comment.role === 'Instructor' ? styles.instructorIcon : styles.studentIcon
                      ]}>
                        <Text style={styles.commentProfileIconText}>
                          {comment.author?.charAt(0)?.toUpperCase() || (comment.role === 'Instructor' ? '👨‍🏫' : '👤')}
                        </Text>
                      </View>
                    )}
                    <View style={styles.commentContent}>
                      <View style={styles.commentHeader}>
                        <Text style={styles.commentAuthor}>{comment.author}</Text>
                        <Text style={[
                          styles.commentRoleTag,
                          comment.role === 'Instructor' ? styles.instructorTag : styles.studentTag
                        ]}>
                          {comment.role}
                        </Text>
                      </View>
                      <Text style={styles.commentMessage}>{comment.message}</Text>
                      <Text style={styles.commentTimestamp}>
                        {comment.timestamp || 'Just now'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Add Comment Section */}
            <View style={styles.addCommentSection}>
              <View style={styles.addCommentContainer}>
                {currentUser?.photoURL ? (
                  <Image source={{ uri: currentUser.photoURL }} style={styles.commentAvatar} />
                ) : (
                  <View style={[
                    styles.commentProfileIcon,
                    userRole === 'instructor' ? styles.instructorIcon : styles.studentIcon
                  ]}>
                    <Text style={styles.commentProfileIconText}>
                      {currentUser?.displayName?.charAt(0)?.toUpperCase() || currentUser?.email?.charAt(0)?.toUpperCase() || (userRole === 'instructor' ? '👨‍🏫' : '👤')}
                    </Text>
                  </View>
                )}
                <TextInput
                  style={styles.commentInput}
                  placeholder="Write a comment..."
                  placeholderTextColor="#888"
                  multiline={true}
                  value={newComment}
                  onChangeText={setNewComment}
                  maxLength={500}
                />
                <TouchableOpacity 
                  style={[
                    styles.submitCommentButton,
                    newComment.trim() ? styles.submitCommentButtonActive : null
                  ]}
                  onPress={submitComment}
                >
                  <Text style={[
                    styles.submitCommentButtonText,
                    newComment.trim() ? styles.submitCommentButtonTextActive : null
                  ]}>
                    Post
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Post Modal */}
      <Modal visible={showEditPostModal} transparent={true} animationType="slide">
        <View style={styles.newPostOverlay}>
          <View style={styles.newPostModal}>
            <View style={styles.newPostHeader}>
              <Text style={styles.newPostTitle}>Edit Post</Text>
              <TouchableOpacity onPress={closeEditPostModal}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.newPostContent}>
              <View style={styles.newPostAuthor}>
                {currentUser?.photoURL ? (
                  <Image source={{ uri: currentUser.photoURL }} style={styles.postAvatar} />
                ) : (
                  <View style={[
                    styles.profileIcon,
                    userRole === 'instructor' ? styles.instructorIcon : styles.studentIcon
                  ]}>
                    <Text style={styles.profileIconText}>
                      {currentUser?.displayName?.charAt(0)?.toUpperCase() || currentUser?.email?.charAt(0)?.toUpperCase() || (userRole === 'instructor' ? '👨‍🏫' : '👤')}
                    </Text>
                  </View>
                )}
                <View style={styles.profileTextContainer}>
                  <Text style={styles.authorName}>
                    {currentUser?.displayName || currentUser?.email || 'You'}
                  </Text>
                  <Text style={[
                    styles.roleTag,
                    userRole === 'instructor' ? styles.instructorTag : styles.studentTag
                  ]}>
                    {userRole === 'instructor' ? 'Instructor' : 'Student'}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.audienceInProfile}
                  onPress={() => setShowAudienceModal(true)}
                >
                  <Text style={styles.audienceProfileText}>{getAudienceDisplayText()}</Text>
                  <Text style={styles.audienceProfileArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.newPostTextInput}
                placeholder="Edit your post..."
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
                        <Text style={styles.filePreviewIcon}>{getFileIcon(file.name)}</Text>
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
              
              <TouchableOpacity style={styles.submitPostButton} onPress={submitEditPost}>
                <Text style={styles.submitPostButtonText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
              <View style={styles.sideMenuTitleContainer}>
                <Image
                        source={require('../assets/PATHlow.png')}
                        style={styles.logo}
                        resizeMode='contain'
                        accessibilityLabel="PATHFIT logo" />
                {userRole && (
                  <View style={[styles.sideMenuRoleBadge, userRole === 'instructor' ? styles.instructorBadge : styles.studentBadge]}>
                    <Text style={[styles.sideMenuRoleText, userRole === 'instructor' ? styles.instructorText : styles.studentText]}>
                      {userRole === 'instructor' ? 'Instructor' : 'Student'}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowSideMenu(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.menuItemsContainer}>
              {menuItems.map((item, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.menuItem}
                  onPress={() => {
                    setShowSideMenu(false);
                    
                    // Navigate based on menu item
                    switch(item) {
                      case 'PATHclass':
                        navigation.navigate('PATHclass');
                        break;
                      case 'Announcement':
                        navigation.navigate('SectionAnnouncement');
                        break;
                      case 'Attendance':
                        // Navigate to the appropriate attendance screen by role
                        if (userRole === 'instructor') {
                          navigation.navigate('InstructorAttendance');
                        } else {
                          navigation.navigate('StudentAttendance');
                        }
                        break;
                      case 'My Events':
                        navigation.navigate('MyEvents');
                          break;

                      default:
                        // Dashboard or other items stay on home
                        break;
                    }
                  }}
                >
                  <Text style={styles.menuItemText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.userSection}>
              <View style={styles.userInfo}>
                {currentUser?.photoURL ? (
                  <Image source={{ uri: currentUser.photoURL }} style={styles.userAvatar} />
                ) : (
                  <View style={styles.userIcon}>
                    <Text style={styles.userIconText}>
                      {currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || '👤'}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={styles.userName}>
                    {currentUser?.displayName || currentUser?.email || 'Ejine Mangcobihon'}
                  </Text>
                  <TouchableOpacity onPress={() => {
                    setShowSideMenu(false);
                    navigation.navigate('MyProfile');
                  }}>
                    <Text style={styles.userOption}>My Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    setShowSideMenu(false);
                    navigation.navigate('Settings');
                  }}>
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

      {/* Audience Selection Modal */}
      <Modal visible={showAudienceModal} transparent={true} animationType="slide">
        <View style={styles.audienceModalOverlay}>
          <View style={styles.audienceModal}>
            <View style={styles.audienceModalHeader}>
              <Text style={styles.audienceModalTitle}>Select Audience</Text>
              <TouchableOpacity onPress={() => setShowAudienceModal(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.audienceOptions}>
              <TouchableOpacity 
                style={[styles.audienceOptionItem, selectedAudience === 'World' && styles.selectedAudienceOption]}
                onPress={() => {
                  setSelectedAudience('World');
                  setShowAudienceModal(false);
                }}
              >
                <Text style={styles.audienceOptionIcon}>🌍</Text>
                <View style={styles.audienceOptionInfo}>
                  <Text style={styles.audienceOptionTitle}>World</Text>
                  <Text style={styles.audienceOptionDescription}>Everyone can see this post</Text>
                </View>
                {selectedAudience === 'World' && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.audienceOptionItem, (selectedAudience === 'Classmates' || selectedAudience === 'Class') && styles.selectedAudienceOption]}
                onPress={() => {
                  setShowSectionSelection(true);
                }}
              >
                <Text style={styles.audienceOptionIcon}>👥</Text>
                <View style={styles.audienceOptionInfo}>
                  <Text style={styles.audienceOptionTitle}>Class</Text>
                  <Text style={styles.audienceOptionDescription}>
                    {userRole === 'instructor' 
                      ? 'Share with students in your classes' 
                      : 'Share with classmates in your classes'
                    }
                  </Text>
                </View>
                {(selectedAudience === 'Classmates' || selectedAudience === 'Class') && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.audienceOptionItem, selectedAudience === 'Only Me' && styles.selectedAudienceOption]}
                onPress={() => {
                  setSelectedAudience('Only Me');
                  setShowAudienceModal(false);
                }}
              >
                <Text style={styles.audienceOptionIcon}>🔒</Text>
                <View style={styles.audienceOptionInfo}>
                  <Text style={styles.audienceOptionTitle}>Only Me</Text>
                  <Text style={styles.audienceOptionDescription}>Only you can see this post</Text>
                </View>
                {selectedAudience === 'Only Me' && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            </View>
            
            {/* Section Selection for Classmates */}
            {showSectionSelection && (
              <View style={styles.sectionSelectionContainer}>
                <View style={styles.sectionSelectionHeader}>
                  <TouchableOpacity onPress={() => setShowSectionSelection(false)}>
                    <Text style={styles.backButton}>← Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.sectionSelectionTitle}>Select Classes</Text>
            
                  <TouchableOpacity 
                    onPress={() => {
                      if (selectedSections.length > 0) {
                        setSelectedAudience('Class');
                        setShowAudienceModal(false);
                        setShowSectionSelection(false);
                      }
                    }}
                    disabled={selectedSections.length === 0 || userEnrolledSections.length === 0}
                  >
                    <Text style={[
                      styles.doneButton, 
                      (selectedSections.length === 0 || userEnrolledSections.length === 0) && styles.doneButtonDisabled
                    ]}>
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.sectionsList}>
                  {userEnrolledSections.length > 0 ? (
                    userEnrolledSections.map((section) => (
                      <TouchableOpacity
                        key={section}
                        style={[
                          styles.sectionItem,
                          selectedSections.includes(section) && styles.selectedSectionItem
                        ]}
                        onPress={() => {
                          setSelectedSections(prev => 
                            prev.includes(section)
                              ? prev.filter(s => s !== section)
                              : [...prev, section]
                          );
                        }}
                      >
                        <Text style={styles.sectionName}>{section}</Text>
                        {selectedSections.includes(section) && <Text style={styles.checkmark}>✓</Text>}
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.noSectionsContainer}>
                      <Text style={styles.noSectionsText}>
                        {userRole === 'instructor' 
                          ? 'You have not created any classes yet.' 
                          : 'You are not enrolled in any classes yet.'
                        }
                      </Text>
                      <Text style={styles.noSectionsSubtext}>
                        {userRole === 'instructor'
                          ? 'Create a class in PATHclass to share posts with your students.'
                          : 'Please join a class in PATHclass to share posts with your classmates.'
                        }
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffeee0',
  },
 
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
    backgroundColor: '#fffdfb',
  },
  logo: {
    width: 100, 
    height: 100,         
    resizeMode: 'contain', 
    marginBottom: -35,
    marginTop: -15,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E75C1A',
    letterSpacing: 1,
    marginRight: 12,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  instructorBadge: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  studentBadge: {
    backgroundColor: '#E8F5E8',
    borderColor: '#4CAF50',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  instructorText: {
    color: '#1976D2',
  },
  studentText: {
    color: '#388E3C',
  },
  menuButton: {
    padding: 8,
  },
  menuIcon: {
    fontSize: 50,
    color: '#042175',
    marginTop: 25,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  whatsOnYourMindContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  whatsOnYourMindContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userProfileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userProfileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userProfileIconText: {
    color: '#fff',
    fontSize: 18,
  },
  userOption: {
    color: '#fff',
    fontSize: 18,
  },
  whatsOnYourMindText: {
    fontSize: 16,
    color: '#888',
    flex: 1,
    marginLeft: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  viewAllText: {
    fontSize: 14,
    color: '#E75C1A',
    fontWeight: '600',
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
  announcementBadge: {
    backgroundColor: '#FFF8DC',
    borderColor: '#FFD700',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  announcementBadgeText: {
    fontSize: 10,
    color: '#B8860B',
    fontWeight: 'bold',
  },
  announcementRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  instructorIcon: {
    backgroundColor: '#E75C1A',
  },
  studentIcon: {
    backgroundColor: '#4A90E2',
  },
  instructorTag: {
    backgroundColor: '#FFF3E0',
    color: '#E75C1A',
  },
  studentTag: {
    backgroundColor: '#E3F2FD',
    color: '#4A90E2',
  },
  postText: {
    fontSize: 18,
    color: '#444',
    lineHeight: 20,
    marginBottom: 12,
    marginLeft: 10,
    marginRight: 10
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
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
  postTaggedFriends: {
    marginBottom: 8,
  },
  postTaggedText: {
    fontSize: 12,
    color: '#4A90E2',
    fontStyle: 'italic',
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginLeft: 10,
    marginRight: 10,
    borderTopWidth: 2,
    borderTopColor: '#cbcbcb',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  actionIcon: {
    fontSize: 25,
    color: '#888',
  },
  actionCount: {
    fontSize: 15,
    color: '#888',
  },
  actionText: {
    fontSize: 15,
    color: '#888',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  goToClassWallButton: {
    backgroundColor: '#E75C1A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  goToClassWallText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  postAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  profileIconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  timestamp: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  audienceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  audienceIcon: {
    fontSize: 10,
    marginRight: 4,
  },
  audienceText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  postMenuButton: {
    padding: 8,
    marginLeft: 8,
  },
  postMenuIcon: {
    fontSize: 20,
    color: '#888',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sideMenu: {
    position: 'absolute',
    top: 0,
    right: 0,   
    width: '75%',
    height: '100%',
    backgroundColor: '#ffeee0',
    paddingTop: 40,
    zIndex: 1000,    
    elevation: 10, 
    shadowColor: '#000', 
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sideMenuHeader: {
    flexDirection: 'row',
    backgroundColor: '#fff',
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
    marginRight: 8,
  },
  sideMenuTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sideMenuRoleBadge: {
    paddingHorizontal: 30,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
  },
  sideMenuRoleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  closeButton: {
    fontSize: 25,
    color: '#333',
    padding: 4,
    marginTop: 14,
    marginRight: 3,
  },
  menuItemsContainer: {
    flex: 1,
    paddingVertical: 10,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#fff',
  },
  menuItemText: {
    fontSize: 18,
    color: '#042175',
  },
  userSection: {
    borderTopWidth: 1,
    backgroundColor: '#fff',
    borderTopColor: '#fff',
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  userIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#042175',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userIconText: {
    color: '#fff',
    fontSize: 18,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#042175',
    marginBottom: 8,
  },
  userOption: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  
  // Post Menu Modal Styles
  postMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postMenuModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '80%',
    maxWidth: 300,
  },
  actionIconImage: {
    width: 22,
    height: 22,
    marginRight: 6,
    resizeMode: 'contain',
  },
  
  postMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  postMenuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButtonText: {
    fontSize: 25,
    color: '#666',
    fontWeight: 'bold',
  },
  postMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  deleteOption: {
    borderBottomWidth: 0,
  },
  postMenuOptionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  postMenuOptionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  deleteOptionText: {
    color: '#ff4444',
  },
  
  // New Post Modal Styles
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
  
  // Liked post style
  likedIcon: {
    color: '#ff3040',
  },
  
  // Comment Modal Styles
  commentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  commentModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  commentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  commentModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  commentsContainer: {
    flex: 1,
    padding: 16,
  },
  noCommentsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noCommentsText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  commentProfileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  commentProfileIconText: {
    color: '#fff',
    fontSize: 16,
  },
  commentContent: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  commentRoleTag: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  commentMessage: {
    fontSize: 14,
    color: '#444',
    lineHeight: 18,
    marginBottom: 4,
  },
  commentTimestamp: {
    fontSize: 12,
    color: '#888',
  },
  addCommentSection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 16,
  },
  addCommentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    marginHorizontal: 12,
    fontSize: 14,
    color: '#333',
  },
  submitCommentButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ddd',
  },
  submitCommentButtonActive: {
    backgroundColor: '#E75C1A',
  },
  submitCommentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  submitCommentButtonTextActive: {
    color: '#fff',
  },
  // Audience Modal Styles
  audienceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audienceModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  audienceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  audienceModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  audienceOptions: {
    gap: 12,
  },
  audienceOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedAudienceOption: {
    borderColor: '#E75C1A',
    backgroundColor: '#fff5f0',
  },
  audienceOptionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  audienceOptionInfo: {
    flex: 1,
  },
  audienceOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  audienceOptionDescription: {
    fontSize: 12,
    color: '#666',
  },
  checkmark: {
    fontSize: 18,
    color: '#E75C1A',
    fontWeight: 'bold',
  },
  // Section Selection Styles
  sectionSelectionContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderRadius: 15,
  },
  sectionSelectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    fontSize: 16,
    color: '#E75C1A',
    fontWeight: '600',
  },
  sectionSelectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  doneButton: {
    fontSize: 16,
    color: '#E75C1A',
    fontWeight: '600',
  },
  doneButtonDisabled: {
    color: '#ccc',
  },
  sectionsList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedSectionItem: {
    borderColor: '#E75C1A',
    backgroundColor: '#fff5f0',
  },
  sectionName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  noSectionsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noSectionsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  noSectionsSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  audienceInProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  audienceProfileText: {
    fontSize: 12,
    color: '#666',
    marginRight: 4,
  },
  audienceProfileArrow: {
    fontSize: 10,
    color: '#666',
  },
  roleAndAudienceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
});
