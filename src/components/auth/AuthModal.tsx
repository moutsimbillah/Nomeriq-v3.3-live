import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { VerifyEmailForm } from "./VerifyEmailForm";

export const AuthModal = () => {
    const { isOpen, view, closeModal, openModal } = useAuthModal();
    const [email, setEmail] = useState("");

    // Reset email when modal closes
    useEffect(() => {
        if (!isOpen) {
            setEmail("");
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const renderForm = () => {
        switch (view) {
            case "login":
                return <LoginForm onSwitchToSignup={() => openModal("signup")} onClose={closeModal} />;
            case "signup":
                return <SignupForm onSwitchToLogin={() => openModal("login")} onClose={closeModal} />;
            case "forgot-password":
                return <ForgotPasswordForm onBackToLogin={() => openModal("login")} onClose={closeModal} />;
            case "verify-email":
                return <VerifyEmailForm email={email} onBackToLogin={() => openModal("login")} onClose={closeModal} />;
            default:
                return null;
        }
    };

    const getTitle = () => {
        switch (view) {
            case "login":
                return "Welcome Back";
            case "signup":
                return "Create Account";
            case "forgot-password":
                return "Forgot Password?";
            case "verify-email":
                return "Verify Your Email";
            default:
                return "";
        }
    };

    return (
        <div className={`fixed inset-0 z-[100] flex justify-center p-4 ${view === 'signup' ? 'items-start pt-32' : 'items-center'}`}>{/* Only signup modal gets extra top padding */}
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
                onClick={closeModal}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md transform transition-all duration-300 ease-out">
                <div className="bg-background/95 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl overflow-hidden opacity-100 scale-100">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                        <h2 className="text-lg font-semibold">{getTitle()}</h2>
                        <button
                            onClick={closeModal}
                            className="p-2 rounded-full hover:bg-secondary/50 transition-colors"
                        >
                            <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">{renderForm()}</div>
                </div>
            </div>
        </div>
    );
};
