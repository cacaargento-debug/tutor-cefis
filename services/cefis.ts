export interface CefisCourse { id: string; title: string; area: string; }
export interface CefisTrack { id: string; title: string; courseIds: string[]; }
export interface CefisLesson { id: string; courseId: string; title: string; }
export interface CefisUserProfile { id: string; name: string; email: string; }

export interface CefisClient {
  getCourses(): Promise<CefisCourse[]>;
  getTracks(): Promise<CefisTrack[]>;
  getLessons(courseId: string): Promise<CefisLesson[]>;
  getUserProfile(): Promise<CefisUserProfile>;
}

// Mock implementation. Replace with a real HTTP client behind the same interface
// when CEFIS_API_BASE_URL / CEFIS_API_KEY are provided.
const mock: CefisClient = {
  async getCourses() {
    return [
      { id: "icms-101", title: "ICMS na prática", area: "fiscal" },
      { id: "cfop-101", title: "CFOP e classificação de operações", area: "fiscal" },
      { id: "sped-101", title: "SPED Fiscal do zero", area: "fiscal" },
    ];
  },
  async getTracks() {
    return [{ id: "fiscal-analyst", title: "Analista Fiscal", courseIds: ["icms-101", "cfop-101", "sped-101"] }];
  },
  async getLessons(courseId) {
    return [
      { id: `${courseId}-l1`, courseId, title: "Introdução" },
      { id: `${courseId}-l2`, courseId, title: "Casos práticos" },
    ];
  },
  async getUserProfile() {
    return { id: "mock-user", name: "Aluno CEFIS", email: "aluno@cefis.com.br" };
  },
};

export function getCefisClient(): CefisClient {
  // When the real API is wired, branch on env.CEFIS_API_BASE_URL here.
  return mock;
}
