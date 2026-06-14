package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ErrNeedsRepoScope means the token lacks public_repo and cannot open a PR.
var ErrNeedsRepoScope = errors.New("github token missing public_repo scope")

const registryOwner = "argus-hooks"
const registryRepo = "registry"

// PublishFile is one file to publish (basename + text body).
type PublishFile struct {
	Name string
	Body string
}

// SetBaseURL overrides the API base (tests only).
func (g *GistClient) SetBaseURL(u string) { g.baseURL = u }

func (g *GistClient) decode(ctx context.Context, method, path string, payload any, out any) error {
	resp, err := g.do(ctx, method, path, payload)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("github %s %s: status %d", method, path, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (g *GistClient) hasRepoScope(ctx context.Context) (bool, error) {
	resp, err := g.do(ctx, http.MethodGet, "/user", nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = resp.Body.Close() }()
	scopes := resp.Header.Get("X-OAuth-Scopes")
	return strings.Contains(scopes, "public_repo") || strings.Contains(scopes, "repo"), nil
}

type treeEntry struct {
	Path string `json:"path"`
	Mode string `json:"mode"`
	Type string `json:"type"`
	SHA  string `json:"sha"`
}

func shortSHA(s string) string {
	if len(s) > 7 {
		return s[:7]
	}
	return s
}

// PublishRegistry forks argus-hooks/registry (if needed), commits all files under
// scripts/<login>/ in one commit on a new branch, and opens a PR. Returns PR URL.
func (g *GistClient) PublishRegistry(ctx context.Context, files []PublishFile, description string) (string, error) {
	if len(files) == 0 {
		return "", errors.New("no files to publish")
	}
	ok, err := g.hasRepoScope(ctx)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrNeedsRepoScope
	}

	var user struct {
		Login string `json:"login"`
	}
	if err := g.decode(ctx, http.MethodGet, "/user", nil, &user); err != nil {
		return "", err
	}
	login := user.Login

	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/forks", registryOwner, registryRepo), map[string]any{}, nil); err != nil {
		return "", err
	}
	// GitHub forks asynchronously (the POST returns 202), so the fork repo may
	// not exist yet. Poll, bounded, before using it.
	forkPath := fmt.Sprintf("/repos/%s/%s", login, registryRepo)
	var forkErr error
	for attempt := 0; attempt < 5; attempt++ {
		if forkErr = g.decode(ctx, http.MethodGet, forkPath, nil, nil); forkErr == nil {
			break
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(time.Duration(attempt+1) * time.Second):
		}
	}
	if forkErr != nil {
		return "", fmt.Errorf("fork not ready: %w", forkErr)
	}

	var ref struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := g.decode(ctx, http.MethodGet,
		fmt.Sprintf("/repos/%s/%s/git/ref/heads/main", login, registryRepo), nil, &ref); err != nil {
		return "", err
	}
	baseSHA := ref.Object.SHA

	var commit struct {
		Tree struct {
			SHA string `json:"sha"`
		} `json:"tree"`
	}
	if err := g.decode(ctx, http.MethodGet,
		fmt.Sprintf("/repos/%s/%s/git/commits/%s", login, registryRepo, baseSHA), nil, &commit); err != nil {
		return "", err
	}

	entries := make([]treeEntry, 0, len(files))
	for _, f := range files {
		var blob struct {
			SHA string `json:"sha"`
		}
		if err := g.decode(ctx, http.MethodPost,
			fmt.Sprintf("/repos/%s/%s/git/blobs", login, registryRepo),
			map[string]string{"content": f.Body, "encoding": "utf-8"}, &blob); err != nil {
			return "", err
		}
		entries = append(entries, treeEntry{
			Path: fmt.Sprintf("scripts/%s/%s", login, f.Name), Mode: "100644", Type: "blob", SHA: blob.SHA,
		})
	}

	var tree struct {
		SHA string `json:"sha"`
	}
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/git/trees", login, registryRepo),
		map[string]any{"base_tree": commit.Tree.SHA, "tree": entries}, &tree); err != nil {
		return "", err
	}

	var newCommit struct {
		SHA string `json:"sha"`
	}
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/git/commits", login, registryRepo),
		map[string]any{"message": "Add scripts from " + login, "tree": tree.SHA, "parents": []string{baseSHA}},
		&newCommit); err != nil {
		return "", err
	}

	// Derive the branch from the new commit SHA so re-publishing the same file
	// set still gets a unique branch (GitHub sets a fresh commit timestamp, so
	// the SHA differs each call) — avoids "reference already exists" on retry.
	branch := "argus-share-" + shortSHA(newCommit.SHA)
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/git/refs", login, registryRepo),
		map[string]string{"ref": "refs/heads/" + branch, "sha": newCommit.SHA}, nil); err != nil {
		return "", err
	}

	var pr struct {
		HTMLURL string `json:"html_url"`
	}
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/pulls", registryOwner, registryRepo),
		map[string]string{
			"title": "Add scripts from " + login,
			"head":  login + ":" + branch,
			"base":  "main",
			"body":  description,
		}, &pr); err != nil {
		return "", err
	}
	return pr.HTMLURL, nil
}
