import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { auth } from "./firebase";

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    // Explicitly return both user and the credential to capture the token
    return { user: result.user, credential: GoogleAuthProvider.credentialFromResult(result) };
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

export const onAuthUIStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
