import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { collection, addDoc, getDocs } from 'firebase/firestore';

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
          likes: 3,
          comments: 5,
          replies: []
        }
      ]);
    }
  };

  useEffect(() => {
    getPosts();
  }, []);

  const handlePost = async () => {
    if (newPost.trim() && !isPosting) {
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
        likes: 0,
        comments: 0,
        replies: [],
        id: Date.now().toString() // Temporary ID until Firebase assigns real one
      };

      // Add post to local state immediately (optimistic update)
      setPosts(prevPosts => [newPostData, ...prevPosts]);
      
      // Clear the input
      const originalPost = newPost.trim();
      setNewPost('');

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
          <Text style={styles.userName}>You</Text>
        </View>
        <TextInput
          style={styles.newPostInput}
          placeholder="Share something with your class..."
          multiline
          value={newPost}
          onChangeText={setNewPost}
        />
        <TouchableOpacity 
          style={[
            styles.postButton, 
            (isPosting || !newPost.trim()) && styles.postButtonDisabled
          ]} 
          onPress={handlePost}
          disabled={isPosting || !newPost.trim()}
        >
          <Text style={[
            styles.postButtonText,
            (isPosting || !newPost.trim()) && styles.postButtonTextDisabled
          ]}>
            {isPosting ? 'Posting...' : 'Post'}
          </Text>
        </TouchableOpacity>
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
