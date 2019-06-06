# Contributing to OpenAPI-to-GraphQL

This document lists the differences between the contribution guidelines for this repository and the general [**Contributing to LoopBack**](http://loopback.io/doc/en/contrib/index.html) guidelines.

### Developer Certificate of Origin

This repository uses a [Developer Certificate of Origin (DCO)](https://developercertificate.org/) instead of a [Contributor License Agreement](https://cla.strongloop.com/agreements/strongloop/loopback.io) like most other LoopBack repositories. DCO is an easier process to adhere to. [Full text of DCO](https://developercertificate.org/) can be found below, formatted for readability.

> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have the right to submit it under the open source license indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best of my knowledge, is covered under an appropriate open source license and I have the right under that license to submit that work with modifications, whether created in whole or in part by me, under the same open source license (unless I am permitted to submit under a different license), as indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who certified (a), (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are public and that a record of the contribution (including all personal information I submit with it, including my sign-off) is maintained indefinitely and may be redistributed consistent with this project or the open source license(s) involved.

Contributors sign-off that they adhere to these requirements by adding a Signed-off-by line to commit messages.

```
This is my commit message

Signed-off-by: Random J Developer <random@developer.example.org>
```

Git even has a -s command line option to append this automatically to your commit message:

```sh
$ git commit -s -m 'This is my commit message'
```

#### Fixing Commit Messages

If you've pushed a commit and forgot to sign it, fear not, you can sign it as follows:

```
git commit --amend -s
```

Modify the commit message (if desired) -- do not modify the `Signed-off-by` line. Exit edit mode (`esc` followed by `:x` and then `Enter`).

Now force-push the changes by running:

```
git push origin +[branch-name]
```

Refer to the [official documentation](https://help.github.com/articles/changing-a-commit-message/#amending-older-or-multiple-commit-messages) for modifying multiple commits or an example with screenshots.

If all else fails, ask the LoopBack team for help :)
