using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EMS.Data.Models;

public class User
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int UserID { get; set; }

    [Required]
    [StringLength(100)]
    public string FullName { get; set; } = string.Empty;

    [StringLength(100)]
    public string? Designation { get; set; }

    [Required]
    [StringLength(100)]
    public string MailId { get; set; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string LoginPassword { get; set; } = string.Empty;

    [StringLength(20)]
    public string Status { get; set; } = "Active";

    [StringLength(50)]
    public string? Department { get; set; }

    public string? Roles { get; set; }
}
