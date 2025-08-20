import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {
  notificationService,
  type Notification,
} from "@/services/notificationService";

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  removeNotification: (notificationId: string) => void;
  clearAll: () => void;
  addNotification: (notification: {
    type: Notification["type"];
    title: string;
    message: string;
    data?: any;
    taskId?: number;
    daoId?: string;
  }) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  let auth;
  try {
    auth = useAuth();
  } catch (error) {
    console.error("NotificationProvider: Auth context not available", error);
    auth = { user: null, isLoading: false };
  }

  const { user, isLoading } = auth;
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Subscribe to notification service updates - ALWAYS call hooks in the same order
  useEffect(() => {
    if (!user) return;

    const unsubscribe = notificationService.subscribe(
      (updatedNotifications) => {
        const userNotifications = updatedNotifications.filter(
          (n) => n.userId === user.id,
        );
        setNotifications(userNotifications);
      },
    );

    // Load initial notifications
    const userNotifications = notificationService.getUserNotifications(user.id);
    setNotifications(userNotifications);

    return unsubscribe;
  }, [user]);

  // Handle early returns AFTER all hooks are called
  if (!user || isLoading) {
    return <>{children}</>;
  }

  const markAsRead = (notificationId: string) => {
    notificationService.markAsRead(notificationId);
  };

  const markAllAsRead = () => {
    if (user) {
      notificationService.markAllAsRead(user.id);
    }
  };

  const removeNotification = (notificationId: string) => {
    notificationService.deleteNotification(notificationId);
  };

  const clearAll = () => {
    if (user) {
      notificationService.clearAllNotifications(user.id);
    }
  };

  const addNotification = (notification: {
    type: Notification["type"];
    title: string;
    message: string;
    data?: any;
    taskId?: number;
    daoId?: string;
  }) => {
    if (user) {
      const data = {
        ...notification.data,
        ...(notification.taskId && { taskId: notification.taskId }),
        ...(notification.daoId && { daoId: notification.daoId }),
      };
      notificationService.addNotification(
        user.id,
        notification.type,
        notification.title,
        notification.message,
        data,
      );
    }
  };

  const unreadCount = user ? notificationService.getUnreadCount(user.id) : 0;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
        addNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
}

// Version optionnelle qui retourne null si le contexte n'est pas disponible
export function useNotificationsOptional() {
  try {
    return useNotifications();
  } catch {
    return null;
  }
}
