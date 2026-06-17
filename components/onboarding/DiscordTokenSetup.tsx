"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Copy, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { useBackendData } from "@/src/context/BackendDataContext";
import { useSearchParams, useRouter } from "next/navigation";

// Update the CopyableCode interface
interface CopyableCodeProps {
  code: string;
  theme: string | undefined; // Allow undefined theme
}

function CopyableCode({ code, theme = 'light' }: CopyableCodeProps) { // Add default value
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative rounded-md p-4 pt-10 font-mono text-sm pb-10 ${theme === "dark" ? "bg-gray-800" : "bg-gray-100"}`}>
      <pre className="whitespace-pre-wrap break-all">{code}</pre>
      <button 
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1 hover:bg-gray-200 rounded"
        aria-label="Copy code"
      >
        {copied ? <span>Copied!</span> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

interface DiscordTokenSetupProps {
  onNext: () => void;
  onBack: () => void;
  theme?: string;
  isRevisit?: boolean;
  onSubmit?: (token: string) => void;
}

const API_BASE_URL = "http://localhost:8000";

export default function DiscordTokenSetup({ 
  onNext, 
  onBack, 
  theme, 
  isRevisit = false,
  onSubmit 
}: DiscordTokenSetupProps) {
  const { discordToken, fetchDiscordToken } = useBackendData();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isRevisitMode = searchParams?.get('step') ?? false;

  // Fetch and set token on component mount
  useEffect(() => {
    const initializeToken = async () => {
      const existingToken = await fetchDiscordToken();
      if (existingToken) {
        setToken(existingToken);
      }
    };

    initializeToken();
  }, [fetchDiscordToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/discord/token`, { token });
      
      if (response.status === 200) {
        toast({
          title: "Success",
          description: "Discord token configured successfully",
        });
        await fetchDiscordToken({ force: true });
        
        // Handle different navigation based on mode
        if (isRevisitMode) {
          router.push('/home');
        } else {
          onSubmit?.(token);
          onNext();
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to configure Discord token",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getThemeStyles = () => ({
    container: theme === "dark" ? "text-white" : "text-gray-900",
    card: theme === "dark" ? "bg-black border-gray-800" : "bg-white border-gray-200",
    textSecondary: theme === "dark" ? "text-gray-400" : "text-gray-600",
    buttonPrimary: theme === "dark" 
      ? "bg-blue-600 hover:bg-blue-700 text-white" 
      : "bg-blue-600 hover:bg-blue-700 text-white",
    buttonOutline: theme === "dark"
      ? "border-gray-700 hover:bg-gray-800 text-white"
      : "border-gray-300 hover:bg-gray-100 text-gray-900",
  });

  const styles = getThemeStyles();

  const codeSnippet = `(webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken!==void 0).exports.default.getToken()`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className={`text-2xl font-semibold ${styles.container}`}>
          Configure Discord Token
        </h2>
        <p className={styles.textSecondary}>
          Follow the steps below to get your Discord token and configure it.
        </p>
      </div>

      <Card className={`p-6 ${styles.card}`}>
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Follow these steps to get your Discord token:
            <ol className="list-decimal ml-4 mt-2 space-y-2">
              <li>
                Login to <a href="https://www.discord.com/login" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">www.discord.com</a> from your Chrome Browser.
              </li>
              <li>Open Developer Tools (Keyboard Shortcut: <code><strong>"Ctrl" + "Shift" + "I"</strong></code>).</li>
              <li>Go to Console, type <code><strong>allow pasting</strong></code> and then paste the provided code:</li>
              
                <CopyableCode code={codeSnippet} theme={theme} />
              
            </ol>

            If the above method fails for some reason (as Discord might change their webpack configuration), you can try out other methods listed in{" "}
            <a 
              href="https://docs.google.com/document/d/1-1VPSiPi2qOYCHcWdrTK1hcOwvacECl203-upqgVC4k/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer" 
              className="text-blue-600 underline"
            >
              this Google Doc
            </a>.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-1 ${styles.container}`}>
              Discord Token
            </label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your Discord token here"
                required
                className={`${styles.card} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                }`}
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className={isRevisitMode ? "flex justify-center" : "flex justify-between"}>
            {isRevisitMode ? (
              <Button
                type="submit"
                disabled={loading}
                className={styles.buttonPrimary}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onBack}
                  className={styles.buttonOutline}
                >
                  Previous Step
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className={styles.buttonPrimary}
                >
                  {loading ? "Configuring..." : "Continue"}
                </Button>
              </>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
} 