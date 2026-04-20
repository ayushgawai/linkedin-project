import { randomUUID } from 'node:crypto';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createProfileMemoryRepository(seed = {}) {
  const members = new Map();

  for (const member of seed.members || []) {
    members.set(member.member_id, clone(member));
  }

  return {
    async health() {
      return 'connected';
    },

    async createMember(input) {
      for (const existing of members.values()) {
        if (existing.email.toLowerCase() === input.email.toLowerCase()) {
          const error = new Error('duplicate');
          error.code = 'DUPLICATE_EMAIL';
          throw error;
        }
      }

      const member = {
        member_id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        connections_count: 0,
        ...clone(input)
      };
      members.set(member.member_id, member);
      return clone(member);
    },

    async getMember(memberId) {
      return members.has(memberId) ? clone(members.get(memberId)) : null;
    },

    async updateMember(memberId, changes) {
      const member = members.get(memberId);
      if (!member) {
        return null;
      }

      const updated = {
        ...member,
        ...clone(changes),
        member_id: member.member_id,
        updated_at: new Date().toISOString()
      };
      members.set(memberId, updated);
      return clone(updated);
    },

    async deleteMember(memberId) {
      return members.delete(memberId);
    },

    async searchMembers(filters) {
      let results = [...members.values()];

      if (filters.keyword) {
        const keyword = filters.keyword.toLowerCase();
        results = results.filter((member) =>
          [member.first_name, member.last_name, member.headline, member.about]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(keyword))
        );
      }

      if (filters.skill) {
        const skill = filters.skill.toLowerCase();
        results = results.filter((member) =>
          (member.skills || []).some((value) => value.toLowerCase() === skill)
        );
      }

      if (filters.location) {
        const location = filters.location.toLowerCase();
        results = results.filter((member) => (member.location || '').toLowerCase().includes(location));
      }

      const total = results.length;
      const start = (filters.page - 1) * filters.pageSize;
      return {
        results: clone(results.slice(start, start + filters.pageSize)),
        total,
        page: filters.page
      };
    }
  };
}

export function createJobMemoryRepository(seed = {}) {
  const jobs = new Map();
  const recruiters = new Map();

  for (const recruiter of seed.recruiters || []) {
    recruiters.set(recruiter.recruiter_id, clone(recruiter));
  }

  for (const job of seed.jobs || []) {
    jobs.set(job.job_id, clone(job));
  }

  return {
    async health() {
      return 'connected';
    },

    async createJob(input) {
      if (!recruiters.has(input.recruiter_id)) {
        return { recruiterMissing: true };
      }

      const job = {
        job_id: randomUUID(),
        posted_datetime: new Date().toISOString(),
        views_count: 0,
        applicants_count: 0,
        ...clone(input)
      };
      jobs.set(job.job_id, job);
      return clone(job);
    },

    async getJob(jobId) {
      return jobs.has(jobId) ? clone(jobs.get(jobId)) : null;
    },

    async updateJob(jobId, changes) {
      const job = jobs.get(jobId);
      if (!job) {
        return null;
      }

      if ('recruiter_id' in changes && !recruiters.has(changes.recruiter_id)) {
        return { recruiterMissing: true };
      }

      const updated = { ...job, ...clone(changes), job_id: job.job_id };
      jobs.set(jobId, updated);
      return clone(updated);
    },

    async searchJobs(filters) {
      let results = [...jobs.values()];

      if (filters.keyword) {
        const keyword = filters.keyword.toLowerCase();
        results = results.filter((job) =>
          [job.title, job.description, job.location]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(keyword))
        );
      }

      if (filters.location) {
        const location = filters.location.toLowerCase();
        results = results.filter((job) => (job.location || '').toLowerCase().includes(location));
      }

      if (filters.employment_type) {
        results = results.filter((job) => job.employment_type === filters.employment_type);
      }

      if (filters.remote_type) {
        results = results.filter((job) => job.remote_type === filters.remote_type);
      }

      if (filters.industry) {
        const industry = filters.industry.toLowerCase();
        results = results.filter((job) => {
          const recruiterIndustry = recruiters.get(job.recruiter_id)?.company_industry || '';
          return recruiterIndustry.toLowerCase().includes(industry);
        });
      }

      const total = results.length;
      const start = (filters.page - 1) * filters.pageSize;
      return {
        results: clone(results.slice(start, start + filters.pageSize)),
        total,
        page: filters.page
      };
    },

    async closeJob(jobId) {
      const job = jobs.get(jobId);
      if (!job) {
        return { notFound: true };
      }

      if (job.status === 'closed') {
        return { alreadyClosed: true };
      }

      job.status = 'closed';
      jobs.set(jobId, job);
      return { status: 'closed' };
    },

    async listByRecruiter(recruiterId, page, pageSize) {
      const results = [...jobs.values()].filter((job) => job.recruiter_id === recruiterId);
      const total = results.length;
      const start = (page - 1) * pageSize;

      return {
        results: clone(results.slice(start, start + pageSize)),
        total,
        page
      };
    }
  };
}

export function createApplicationMemoryRepository(seed = {}) {
  const applications = new Map();
  const notes = [];
  const jobs = new Map();
  const members = new Map();

  for (const job of seed.jobs || []) {
    jobs.set(job.job_id, clone(job));
  }

  for (const member of seed.members || []) {
    members.set(member.member_id, clone(member));
  }

  for (const application of seed.applications || []) {
    applications.set(application.application_id, clone(application));
  }

  return {
    async health() {
      return 'connected';
    },

    async submit(input) {
      if (!jobs.has(input.job_id)) {
        return { missing: 'JOB_NOT_FOUND' };
      }

      if (!members.has(input.member_id)) {
        return { missing: 'MEMBER_NOT_FOUND' };
      }

      if (jobs.get(input.job_id).status === 'closed') {
        return { conflict: 'JOB_CLOSED' };
      }

      if ([...applications.values()].some((application) =>
        application.job_id === input.job_id && application.member_id === input.member_id
      )) {
        return { conflict: 'DUPLICATE_APPLICATION' };
      }

      const application = {
        application_id: randomUUID(),
        application_datetime: new Date().toISOString(),
        status: 'submitted',
        status_note: null,
        ...clone(input)
      };
      applications.set(application.application_id, application);
      return clone(application);
    },

    async getApplication(applicationId) {
      const application = applications.get(applicationId);
      if (!application) {
        return null;
      }

      return {
        ...clone(application),
        notes: clone(notes.filter((note) => note.application_id === applicationId))
      };
    },

    async listByJob(jobId, page, pageSize) {
      const results = [...applications.values()].filter((application) => application.job_id === jobId);
      const total = results.length;
      const start = (page - 1) * pageSize;
      return {
        results: clone(results.slice(start, start + pageSize)),
        total,
        page
      };
    },

    async listByMember(memberId, page, pageSize) {
      const results = [...applications.values()].filter((application) => application.member_id === memberId);
      const total = results.length;
      const start = (page - 1) * pageSize;
      return {
        results: clone(results.slice(start, start + pageSize)),
        total,
        page
      };
    },

    async updateStatus(applicationId, status, note) {
      const application = applications.get(applicationId);
      if (!application) {
        return { notFound: true };
      }

      application.status = status;
      application.status_note = note || null;
      applications.set(applicationId, application);
      return { updated: true };
    },

    async addNote(applicationId, recruiterId, noteText) {
      if (!applications.has(applicationId)) {
        return null;
      }

      const note = {
        note_id: randomUUID(),
        application_id: applicationId,
        recruiter_id: recruiterId,
        note_text: noteText,
        created_at: new Date().toISOString()
      };
      notes.push(note);
      return clone(note);
    }
  };
}
