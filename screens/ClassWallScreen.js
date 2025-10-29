import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, Alert, Modal, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

// Import Firebase with error handling
let db = null;
try {
  const firebase = require('../firebase');
  db = firebase.db;
} catch (error) {
  console.log('Firebase not available:', error);
}

export default function ClassWallScreen() {
  const navigation = useNavigation();
  const [newPost, setNewPost] = useState('');
  const [posts, setPosts] = useState([]);
  const [isPosting, setIsPosting] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [taggedFriends, setTaggedFriends] = useState([]);
  const [friendSearchText, setFriendSearchText] = useState('');

  // Mock friends data - in real app, this would come from Firebase
  const mockFriends = [
    { id: '1', name: 'Maria Santos', avatar: '👩' },
    { id: '2', name: 'Alex Rivera', avatar: '👨' },
    { id: '3', name: 'Sarah Johnson', avatar: '👩' },
    { id: '4', name: 'Mike Chen', avatar: '👨' },
    { id: '5', name: 'Lisa Rodriguez', avatar: '👩' },
    { id: '6', name: 'John Davis', avatar: '👨' },
  ];

  // Initialize posts collection reference
  const postsCollectionRef = db ? collection(db, 'classWall') : null;

  const getPosts = async () => {
    if (!postsCollectionRef) {
      console.log('Firebase not initialized, using default posts');
      // Use default posts if Firebase is not available
      setPosts([
        {
          id: '1',
          author: 'Maria Santos',
          role: 'Student',
          timestamp: 'Oct 27, 2025 3:45 PM',
          message: 'Does anyone have notes from yesterday\'s lecture? I missed the second half due to a family emergency.',
          files: [
            { name: 'Lecture_Notes_Ch5.pdf', size: 2048576 },
            { name: 'Assignment_Template.docx', size: 512000 }
          ],
          likes: 3,
          comments: 5,
          replies: []
        },
        {
          id: '2',
          author: 'Alex Rivera',
          role: 'Student',
          timestamp: 'Oct 27, 2025 1:20 PM',
          message: 'Study group for the upcoming exam? We could meet at the library this weekend.',
          files: [
            { name: 'Study_Guide.xlsx', size: 1024000 }
          ],
          likes: 8,
          comments: 12,
          replies: []
        }
      ]);
      return;
    }

    try {
      const data = await getDocs(postsCollectionRef);
      const postsData = data.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      
      // Sort posts by creation time (newest first)
      postsData.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000);
        }
        return 0;
      });
      
      setPosts(postsData);
    } catch (error) {
      console.error("Error fetching posts: ", error);
      // Fallback to default posts on error
      setPosts([
        {
          id: '1',
          author: 'Maria Santos',
          role: 'Student',
          timestamp: 'Oct 27, 2025 3:45 PM',
          message: 'Does anyone have notes from yesterday\'s lecture? I missed the second half due to a family emergency.',
          files: [
            { name: 'Lecture_Notes_Ch5.pdf', size: 2048576 }
          ],
          likes: 3,
          comments: 5,
          replies: []
        }
      ]);
    }
  };

  useEffect(() => {
    getPosts();
    requestImagePermissions();
  }, []);

  const requestImagePermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to add images!');
    }
  };

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
  };

  const pickDocument = async () => {
    try {
      let result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all file types
        copyToCacheDirectory: true,
        multiple: true, // Allow multiple file selection
      });

      if (!result.canceled && result.assets) {
        // Add new files to existing files
        setSelectedFiles(prev => [...prev, ...result.assets]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const removeFile = (fileIndex) => {
    setSelectedFiles(prev => prev.filter((_, index) => index !== fileIndex));
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'ppt':
      case 'pptx':
        return '📺';
      case 'txt':
        return '📋';
      case 'zip':
      case 'rar':
        return '🗂️';
      default:
        return '📎';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const toggleFriendTag = (friend) => {
    setTaggedFriends(prev => {
      const isAlreadyTagged = prev.find(f => f.id === friend.id);
      if (isAlreadyTagged) {
        return prev.filter(f => f.id !== friend.id);
      } else {
        return [...prev, friend];
      }
    });
  };

  const getFilteredFriends = () => {
    if (!friendSearchText) return mockFriends;
    return mockFriends.filter(friend => 
      friend.name.toLowerCase().includes(friendSearchText.toLowerCase())
    );
  };

  const handlePost = async () => {
    if ((newPost.trim() || selectedImage || selectedFiles.length > 0) && !isPosting) {
      setIsPosting(true);
      
      // Create the new post object
      const currentTime = new Date();
      const formattedTime = currentTime.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const newPostData = {
        author: 'You',
        role: 'Student',
        timestamp: formattedTime,
        message: newPost.trim(),
        image: selectedImage,
        files: selectedFiles,
        taggedFriends: taggedFriends,
        likes: 0,
        comments: 0,
        replies: [],
        id: Date.now().toString() // Temporary ID until Firebase assigns real one
      };

      // Add post to local state immediately (optimistic update)
      setPosts(prevPosts => [newPostData, ...prevPosts]);
      
      // Clear the inputs
      const originalPost = newPost.trim();
      const originalImage = selectedImage;
      const originalFiles = [...selectedFiles];
      const originalTags = [...taggedFriends];
      setNewPost('');
      setSelectedImage(null);
      setSelectedFiles([]);
      setTaggedFriends([]);

      // If Firebase is not available, just keep the local post
      if (!postsCollectionRef) {
        console.log('Firebase not available, keeping post locally');
        setIsPosting(false);
        return;
      }

      try {
        // Save to Firebase
        const docRef = await addDoc(postsCollectionRef, {
          author: 'You',
          role: 'Student',
          timestamp: formattedTime,
          message: originalPost,
          image: originalImage,
          files: originalFiles,
          taggedFriends: originalTags,
          likes: 0,
          comments: 0,
          replies: [],
          createdAt: currentTime
        });

        // Update the local post with the real Firebase ID
        setPosts(prevPosts => 
          prevPosts.map(post => 
            post.id === newPostData.id 
              ? { ...post, id: docRef.id }
              : post
          )
        );
      } catch (error) {
        console.error("Error adding post: ", error);
        // Keep the local post even if Firebase save failed
        console.log('Firebase save failed, keeping post locally');
      } finally {
        setIsPosting(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Class Wall</Text>
        <View style={styles.placeholder} />
      </View>

      {/* New Post Section */}
      <View style={styles.newPostSection}>
        <View style={styles.newPostHeader}>
          <View style={styles.userIcon}>
            <Text style={styles.userIconText}>👤</Text>
          </View>
          <TouchableOpacity 
            style={styles.whatsOnMindButton}
            onPress={() => setShowCreatePostModal(true)}
          >
            <Text style={styles.whatsOnMindText}>What's on your mind?</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Posts List */}
      <ScrollView style={styles.content}>
        {posts.map((post) => (
          <View key={post.id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <View style={[
                styles.profileIcon,
                post.role === 'Instructor' ? styles.instructorIcon : styles.studentIcon
              ]}>
                <Text style={styles.profileIconText}>
                  {post.role === 'Instructor' ? '👨‍🏫' : '👤'}
                </Text>
              </View>
              <View style={styles.postInfo}>
                <View style={styles.authorRow}>
                  <Text style={styles.authorName}>{post.author}</Text>
                  <Text style={[
                    styles.roleTag,
                    post.role === 'Instructor' ? styles.instructorTag : styles.studentTag
                  ]}>
                    {post.role}
                  </Text>
                </View>
                <Text style={styles.timestamp}>{post.timestamp}</Text>
              </View>
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
                {post.files.map((file, index) => (
                  <TouchableOpacity key={index} style={styles.postFileItem}>
                    <Text style={styles.postFileIcon}>{getFileIcon(file.name)}</Text>
                    <View style={styles.postFileInfo}>
                      <Text style={styles.postFileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.postFileSize}>{formatFileSize(file.size)}</Text>
                    </View>
                    <Text style={styles.downloadIcon}>⬇️</Text>
                  </TouchableOpacity>
                ))}
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

            <View style={styles.postActions}>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionIcon}>♡</Text>
                <Text style={styles.actionCount}>{post.likes}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionCount}>{post.comments}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionIcon}>↗</Text>
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* Replies Preview */}
            {post.replies.length > 0 && (
              <View style={styles.repliesSection}>
                <Text style={styles.repliesHeader}>Recent replies:</Text>
                {post.replies.slice(0, 2).map((reply, index) => (
                  <View key={index} style={styles.replyItem}>
                    <Text style={styles.replyAuthor}>{reply.author}:</Text>
                    <Text style={styles.replyText}>{reply.message}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Friend Tagging Modal */}
      <Modal visible={showTagModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tag Friends</Text>
              <TouchableOpacity onPress={() => setShowTagModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.friendSearchInput}
              placeholder="Search friends..."
              value={friendSearchText}
              onChangeText={setFriendSearchText}
            />

            <FlatList
              data={getFilteredFriends()}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isTagged = taggedFriends.find(f => f.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.friendItem, isTagged && styles.friendItemSelected]}
                    onPress={() => toggleFriendTag(item)}
                  >
                    <Text style={styles.friendAvatar}>{item.avatar}</Text>
                    <Text style={[styles.friendName, isTagged && styles.friendNameSelected]}>
                      {item.name}
                    </Text>
                    {isTagged && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
              style={styles.friendsList}
            />

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setShowTagModal(false)}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Post Modal */}
      <Modal visible={showCreatePostModal} transparent={true} animationType="slide">
        <View style={styles.createPostModalOverlay}>
          <View style={styles.createPostModal}>
            {/* Modal Header */}
            <View style={styles.createPostHeader}>
              <TouchableOpacity onPress={() => setShowCreatePostModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.createPostTitle}>Create post</Text>
              <TouchableOpacity 
                style={[
                  styles.postModalButton, 
                  (!newPost.trim() && !selectedImage && selectedFiles.length === 0) && styles.postModalButtonDisabled
                ]} 
                onPress={() => {
                  handlePost();
                  setShowCreatePostModal(false);
                }}
                disabled={!newPost.trim() && !selectedImage && selectedFiles.length === 0}
              >
                <Text style={[
                  styles.postModalButtonText,
                  (!newPost.trim() && !selectedImage && selectedFiles.length === 0) && styles.postModalButtonTextDisabled
                ]}>
                  Post
                </Text>
              </TouchableOpacity>
            </View>

            {/* User Info */}
            <View style={styles.createPostUserInfo}>
              <View style={styles.createPostUserIcon}>
                <Text style={styles.createPostUserIconText}>👤</Text>
              </View>
              <View>
                <Text style={styles.createPostUserName}>You</Text>
                <TouchableOpacity style={styles.privacyButton}>
                  <Text style={styles.privacyButtonText}>🌐 Public ▼</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Post Content */}
            <ScrollView style={styles.createPostContent}>
              <TextInput
                style={styles.createPostInput}
                placeholder="What's on your mind?"
                multiline
                value={newPost}
                onChangeText={setNewPost}
                autoFocus
              />
              
              {/* Selected Image Preview */}
              {selectedImage && (
                <View style={styles.modalImagePreview}>
                  <Image source={{ uri: selectedImage }} style={styles.modalPreviewImage} />
                  <TouchableOpacity style={styles.modalRemoveImageButton} onPress={removeImage}>
                    <Text style={styles.modalRemoveImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Selected Files Preview */}
              {selectedFiles.length > 0 && (
                <View style={styles.modalFilesPreview}>
                  {selectedFiles.map((file, index) => (
                    <View key={index} style={styles.modalFileItem}>
                      <Text style={styles.modalFileIcon}>{getFileIcon(file.name)}</Text>
                      <View style={styles.modalFileInfo}>
                        <Text style={styles.modalFileName} numberOfLines={1}>{file.name}</Text>
                        <Text style={styles.modalFileSize}>{formatFileSize(file.size)}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeFile(index)} style={styles.modalRemoveFileButton}>
                        <Text style={styles.modalRemoveFileText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Tagged Friends Display */}
              {taggedFriends.length > 0 && (
                <View style={styles.modalTaggedFriendsContainer}>
                  <Text style={styles.modalTaggedLabel}>Tagged:</Text>
                  <View style={styles.modalTaggedFriendsWrap}>
                    {taggedFriends.map((friend) => (
                      <View key={friend.id} style={styles.modalTaggedFriend}>
                        <Text style={styles.modalTaggedFriendText}>{friend.avatar} {friend.name}</Text>
                        <TouchableOpacity onPress={() => toggleFriendTag(friend)} style={styles.modalRemoveTagButton}>
                          <Text style={styles.modalRemoveTagText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Action Options */}
            <View style={styles.createPostActions}>
              <Text style={styles.addToPostText}>Add to your post</Text>
              <View style={styles.actionOptionsContainer}>
                <TouchableOpacity style={styles.actionOption} onPress={pickImage}>
                  <Text style={styles.actionOptionIcon}>🖼️</Text>
                  <Text style={styles.actionOptionText}>Photo/video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionOption} onPress={() => setShowTagModal(true)}>
                  <Text style={styles.actionOptionIcon}>👥</Text>
                  <Text style={styles.actionOptionText}>Tag people</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionOption} onPress={pickDocument}>
                  <Text style={styles.actionOptionIcon}>📎</Text>
                  <Text style={styles.actionOptionText}>Files</Text>
                </TouchableOpacity>
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
  newPostSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  newPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  userIconText: {
    color: '#fff',
    fontSize: 16,
  },
  whatsOnMindButton: {
    flex: 1,
    marginLeft: 12,
    padding: 12,
    backgroundColor: '#f0f2f5',
    borderRadius: 20,
    justifyContent: 'center',
  },
  whatsOnMindText: {
    color: '#65676b',
    fontSize: 16,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#dadde1',
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  quickActionIcon: {
    fontSize: 20,
    marginRight: 6,
  },
  quickActionText: {
    fontSize: 14,
    color: '#65676b',
    fontWeight: '500',
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  newPostInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
    fontSize: 14,
  },
  postButton: {
    backgroundColor: '#E75C1A',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  postButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  postButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  postButtonTextDisabled: {
    color: '#888',
  },
  imagePreview: {
    position: 'relative',
    marginBottom: 12,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  taggedFriendsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  taggedLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 8,
  },
  taggedFriendsScroll: {
    flex: 1,
  },
  taggedFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  taggedFriendText: {
    fontSize: 12,
    color: '#1976D2',
  },
  removeTagButton: {
    marginLeft: 4,
    padding: 2,
  },
  removeTagText: {
    fontSize: 10,
    color: '#1976D2',
  },
  filesPreview: {
    marginBottom: 12,
  },
  filesLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  fileIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
    color: '#666',
  },
  removeFileButton: {
    padding: 4,
    marginLeft: 8,
  },
  removeFileText: {
    fontSize: 14,
    color: '#dc3545',
    fontWeight: 'bold',
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  newPostActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  mediaButtonText: {
    fontSize: 12,
    color: '#666',
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
    resizeMode: 'cover',
  },
  postTaggedFriends: {
    marginBottom: 8,
  },
  postTaggedText: {
    fontSize: 12,
    color: '#4A90E2',
    fontStyle: 'italic',
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
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  postFileIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  postFileInfo: {
    flex: 1,
  },
  postFileName: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    marginBottom: 2,
  },
  postFileSize: {
    fontSize: 11,
    color: '#666',
  },
  downloadIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 20,
    color: '#666',
    padding: 4,
  },
  friendSearchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 14,
  },
  friendsList: {
    flex: 1,
    marginBottom: 20,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  friendItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  friendAvatar: {
    fontSize: 20,
    marginRight: 12,
  },
  friendName: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  friendNameSelected: {
    color: '#1976D2',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 16,
    color: '#1976D2',
    fontWeight: 'bold',
  },
  doneButton: {
    backgroundColor: '#E75C1A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  createPostModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  createPostModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  createPostHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#dadde1',
  },
  createPostTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1e21',
  },
  postModalButton: {
    backgroundColor: '#1877f2',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  postModalButtonDisabled: {
    backgroundColor: '#e4e6ea',
  },
  postModalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  postModalButtonTextDisabled: {
    color: '#bcc0c4',
  },
  createPostUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  createPostUserIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  createPostUserIconText: {
    color: '#fff',
    fontSize: 18,
  },
  createPostUserName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1c1e21',
    marginBottom: 2,
  },
  privacyButton: {
    backgroundColor: '#e4e6ea',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  privacyButtonText: {
    fontSize: 12,
    color: '#65676b',
  },
  createPostContent: {
    maxHeight: 300,
    paddingHorizontal: 16,
  },
  createPostInput: {
    fontSize: 16,
    color: '#1c1e21',
    minHeight: 60,
    textAlignVertical: 'top',
    paddingVertical: 8,
  },
  modalImagePreview: {
    position: 'relative',
    marginVertical: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  modalPreviewImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  modalRemoveImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRemoveImageText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalFilesPreview: {
    marginVertical: 12,
  },
  modalFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  modalFileIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  modalFileInfo: {
    flex: 1,
  },
  modalFileName: {
    fontSize: 14,
    color: '#1c1e21',
    fontWeight: '500',
    marginBottom: 2,
  },
  modalFileSize: {
    fontSize: 12,
    color: '#65676b',
  },
  modalRemoveFileButton: {
    padding: 4,
    marginLeft: 8,
  },
  modalRemoveFileText: {
    fontSize: 14,
    color: '#f02849',
    fontWeight: 'bold',
  },
  modalTaggedFriendsContainer: {
    marginVertical: 12,
  },
  modalTaggedLabel: {
    fontSize: 12,
    color: '#65676b',
    marginBottom: 8,
    fontWeight: '600',
  },
  modalTaggedFriendsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modalTaggedFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  modalTaggedFriendText: {
    fontSize: 12,
    color: '#1976d2',
  },
  modalRemoveTagButton: {
    marginLeft: 4,
    padding: 2,
  },
  modalRemoveTagText: {
    fontSize: 10,
    color: '#1976d2',
  },
  createPostActions: {
    borderTopWidth: 1,
    borderTopColor: '#dadde1',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addToPostText: {
    fontSize: 15,
    color: '#1c1e21',
    fontWeight: '600',
    marginBottom: 12,
  },
  actionOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f2f5',
    marginBottom: 8,
  },
  actionOptionIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  actionOptionText: {
    fontSize: 14,
    color: '#1c1e21',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
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
  profileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  instructorIcon: {
    backgroundColor: '#E75C1A',
  },
  studentIcon: {
    backgroundColor: '#4A90E2',
  },
  profileIconText: {
    color: '#fff',
    fontSize: 18,
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
    fontSize: 15,
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
  studentTag: {
    backgroundColor: '#E3F2FD',
    color: '#4A90E2',
  },
  timestamp: {
    fontSize: 12,
    color: '#888',
  },
  postText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 12,
  },
  postActions: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 8,
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
    color: '#888',
  },
  actionCount: {
    fontSize: 12,
    color: '#888',
  },
  actionText: {
    fontSize: 12,
    color: '#888',
  },
  repliesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  repliesHeader: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 6,
  },
  replyItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  replyAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A90E2',
    marginRight: 4,
  },
  replyText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
});
