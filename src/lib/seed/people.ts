import { hashPassword } from "@/lib/auth/password";
import { config } from "@/lib/config";
import type { Person, Role } from "@/lib/types";

export interface PersonDef {
  /** Short key used inside the seed, the id is `per_<key>`. */
  key: string;
  name: string;
  email: string;
  title: string;
  role: Role;
  github: string;
  jira?: string;
}

export const PEOPLE_DEFS: PersonDef[] = [
  { key: "sara", name: "Sara Khan", email: "sara.khan@ssi.example", title: "Project Director", role: "pd", github: "sara-khan-ssi" },
  { key: "omar", name: "Omar Siddiqui", email: "omar.siddiqui@ssi.example", title: "Project Director", role: "pd", github: "omar-siddiqui-ssi" },
  { key: "admin", name: "Ayesha Malik", email: "admin@ssi.example", title: "Head of Delivery", role: "admin", github: "ayesha-malik-ssi" },
  { key: "bilal", name: "Bilal Ahmed", email: "bilal.ahmed@ssi.example", title: "Principal Engineer", role: "member", github: "bilal-ahmed-dev", jira: "bahmed" },
  { key: "nadia", name: "Nadia Hussain", email: "nadia.hussain@ssi.example", title: "Senior Backend Engineer", role: "member", github: "nadia-hussain", jira: "nhussain" },
  { key: "hira", name: "Hira Qureshi", email: "hira.qureshi@ssi.example", title: "Senior Frontend Engineer", role: "member", github: "hiraq", jira: "hqureshi" },
  { key: "zain", name: "Zain Abbas", email: "zain.abbas@ssi.example", title: "DevOps Engineer", role: "member", github: "zainabbas-ops", jira: "zabbas" },
  { key: "maryam", name: "Maryam Tariq", email: "maryam.tariq@ssi.example", title: "QA Lead", role: "member", github: "maryam-tariq-qa", jira: "mtariq" },
  { key: "usman", name: "Usman Sheikh", email: "usman.sheikh@ssi.example", title: "Technical Lead", role: "member", github: "usman-sheikh", jira: "usheikh" },
  { key: "farah", name: "Farah Naeem", email: "farah.naeem@ssi.example", title: "Business Analyst", role: "member", github: "farah-naeem-ba", jira: "fnaeem" },
  { key: "daniyal", name: "Daniyal Rauf", email: "daniyal.rauf@ssi.example", title: "Mobile Engineer", role: "member", github: "daniyalrauf", jira: "drauf" },
  { key: "sana", name: "Sana Iqbal", email: "sana.iqbal@ssi.example", title: "Backend Engineer", role: "member", github: "sana-iqbal-dev", jira: "siqbal" },
  { key: "kamran", name: "Kamran Javed", email: "kamran.javed@ssi.example", title: "Data and Platform Lead", role: "member", github: "kamranjaved", jira: "kjaved" },
  { key: "leila", name: "Leila Haider", email: "leila.haider@ssi.example", title: "UX Designer", role: "member", github: "leila-haider-ux", jira: "lhaider" },
  { key: "tariq", name: "Tariq Mehmood", email: "tariq.mehmood@ssi.example", title: "Staff Engineer", role: "member", github: "tariq-mehmood", jira: "tmehmood" },
];

const BY_KEY = new Map(PEOPLE_DEFS.map((p) => [p.key, p]));

export function personDef(key: string): PersonDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown seed person key: ${key}`);
  return def;
}

export const personId = (key: string): string => `per_${key}`;

export function buildPeople(now: Date): Person[] {
  const password = config.demoPassword;
  const created = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString();
  return PEOPLE_DEFS.map((def) => {
    const person: Person = {
      id: personId(def.key),
      name: def.name,
      email: def.email,
      title: def.title,
      role: def.role,
      handles: {
        github: def.github,
        teams: def.email,
        ...(def.jira ? { jira: def.jira, azureDevOps: def.email } : {}),
      },
      createdAt: created,
    };
    if (def.role !== "member" && password) person.passwordHash = hashPassword(password);
    return person;
  });
}
