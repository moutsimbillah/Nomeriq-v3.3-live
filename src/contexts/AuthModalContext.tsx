import { createContext, useContext, useState, ReactNode } from "react";

type AuthModalView = "login" | "signup" | "forgot-password" | "verify-email" | null;

interface AuthModalContextType {
    isOpen: boolean;
    view: AuthModalView;
    openModal: (view?: AuthModalView) => void;
    closeModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export const useAuthModal = () => {
    const context = useContext(AuthModalContext);
    if (!context) {
        throw new Error("useAuthModal must be used within an AuthModalProvider");
    }
    return context;
};

export const useOptionalAuthModal = () => useContext(AuthModalContext);

export const AuthModalProvider = ({ children }: { children: ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<AuthModalView>("login");

    const openModal = (viewParam: AuthModalView = "login") => {
        setView(viewParam);
        setIsOpen(true);
    };

    const closeModal = () => {
        setIsOpen(false);
    };

    return (
        <AuthModalContext.Provider value={{ isOpen, view, openModal, closeModal }}>
            {children}
        </AuthModalContext.Provider>
    );
};
